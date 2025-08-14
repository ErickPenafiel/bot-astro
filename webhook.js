const express = require("express");
const cors = require("cors");
const { exec } = require("child_process");

const app = express();
const PORT = 3001; // Puerto donde correrá el webhook

app.use(cors());
app.use(express.json());

app.post("/webhook", async (req, res) => {
	console.log("🔄 Webhook recibido, reiniciando bot...");

	exec("pm2 restart bot-whatsapp", (error, stdout, stderr) => {
		if (error) {
			console.error(`❌ Error al reiniciar el bot: ${error.message}`);
			return res.status(500).send("Error al reiniciar el bot");
		}
		console.log(`✅ Bot reiniciado con PM2:\n${stdout}`);
		return res.status(200).send("Bot reiniciado correctamente");
	});
});

app.listen(PORT, () => {
	console.log(`✅ Webhook escuchando en el puerto ${PORT}`);
});
