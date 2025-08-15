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
			{
				delay: 2000,
			},
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

const iniciarBot = async () => {
	console.log("⏳ Cargando flujos desde Firestore...");
	const flujos = await obtenerFlujos();

	if (flujos.length === 0) {
		console.log("⚠️ No se encontraron flujos, revisa la base de datos.");
		return;
	}

	if (!botInstance) {
		console.log("🚀 Iniciando el bot...");

		const adapterDB = new MockAdapter();
		adapterFlow = createFlow(flujos);
		adapterProvider = createProvider(BaileysProvider);

		botInstance = createBot({
			flow: adapterFlow,
			provider: adapterProvider,
			database: adapterDB,
		});

		QRPortalWeb();
		console.log("✅ Bot iniciado correctamente.");
	}
};

// Escucha en tiempo real cambios en la colección "flows" para actualizar el bot
db.collection("flows").onSnapshot(async (snapshot) => {
	console.log("🔄 Flujos actualizados en Firestore, aplicando cambios...");
	botInstance = null;
	await iniciarBot();
});

// Iniciar el bot una sola vez al ejecutar el script
iniciarBot();
