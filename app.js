require("dotenv").config();

const {
	createBot,
	createProvider,
	createFlow,
	addKeyword,
} = require("@bot-whatsapp/bot");
const QRPortalWeb = require("@bot-whatsapp/portal");
const BaileysProvider = require("@bot-whatsapp/provider/baileys");
const MockAdapter = require("@bot-whatsapp/database/mock");
const admin = require("firebase-admin");

const serviceAccount = JSON.parse(
	Buffer.from(process.env.FIREBASE_CREDENTIALS_BASE64, "base64").toString(
		"utf8"
	)
);

admin.initializeApp({
	credential: admin.credential.cert(serviceAccount),
	databaseURL: "https://bot-astro-7cd29-default-rtdb.firebaseio.com/",
});

const db = admin.firestore();

let botInstance = null;
let adapterFlow = null;
let adapterProvider = null;
let adapterDB = null;

// --- ARRANCA EL PORTAL SOLAMENTE UNA VEZ ---
let portalStarted = false;
let portalServer = null;
function startPortalOnce() {
	if (portalStarted) return;
	const port = Number(process.env.PORT || 3000);
	try {
		// algunos builds aceptan opciones { port }, otros sólo una llamada lisa
		const maybeServer = QRPortalWeb({ port });
		portalServer = maybeServer || portalServer;
		portalStarted = true;
		console.log(`🛰️ Portal listo en puerto ${port}`);
	} catch (e) {
		if (e && e.code === "EADDRINUSE") {
			console.log(`ℹ️ El portal ya estaba escuchando en ${port}, continúo.`);
			portalStarted = true; // evita reintentos
		} else {
			console.error("❌ No se pudo iniciar el portal:", e);
		}
	}
}

// ------------------- FLOWS -------------------
const crearFlowDesdeData = (data) => {
	let childFlows = [];
	if (data.childrens) {
		childFlows = Object.values(data.childrens).map((childData) =>
			crearFlowDesdeData(childData)
		);
	}

	if (data.answers && data.answers.length === 1 && data.media) {
		return addKeyword(data.keywords).addAnswer(data.answers[0], {
			media: data.media,
		});
	} else {
		return addKeyword(data.keywords).addAnswer(
			data.answers,
			{ delay: 2000 },
			null,
			childFlows
		);
	}
};

const obtenerFlujos = async () => {
	try {
		const snapshot = await db.collection("flows").get();
		const flows = [];

		snapshot.forEach((doc) => {
			const data = doc.data();
			const flow = crearFlowDesdeData(data);
			flows.push(flow);
		});

		return flows;
	} catch (error) {
		console.error("❌ Error al obtener flujos:", error);
		return [];
	}
};

// ------------------- BOOT -------------------
const iniciarBot = async () => {
	console.log("⏳ Cargando flujos desde Firestore...");
	const flujos = await obtenerFlujos();
	if (flujos.length === 0) {
		console.log("⚠️ No se encontraron flujos, revisa la base de datos.");
		return;
	}

	// Provider / DB persisten entre recargas
	if (!adapterProvider) adapterProvider = createProvider(BaileysProvider);
	if (!adapterDB) adapterDB = new MockAdapter();

	// Re-crea el flow con la data fresca
	adapterFlow = createFlow(flujos);

	if (!botInstance) {
		console.log("🚀 Iniciando el bot por primera vez...");
		botInstance = createBot({
			flow: adapterFlow,
			provider: adapterProvider,
			database: adapterDB,
		});

		// ¡Sólo una vez!
		startPortalOnce();
		console.log("✅ Bot iniciado correctamente.");
	} else {
		// “Hot reload” del bot: recrea la instancia pero NO inicies el portal de nuevo
		console.log(
			"🔁 Actualizando bot con nuevos flujos (sin reiniciar portal)..."
		);
		botInstance = createBot({
			flow: adapterFlow,
			provider: adapterProvider,
			database: adapterDB,
		});
		console.log("✅ Flujos aplicados.");
	}
};

// Escucha en tiempo real cambios y aplica sin reabrir el puerto
db.collection("flows").onSnapshot(async () => {
	console.log("🔄 Flujos actualizados en Firestore, aplicando cambios...");
	await iniciarBot(); // ya no tocamos QRPortalWeb ni ponemos botInstance = null
});

// Iniciar el bot al ejecutar el script
iniciarBot();
