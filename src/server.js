require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { apiKeyAuth } = require("./auth");
const { restartPm2App, listPm2 } = require("./pm2Client");

const app = express();

app.use(helmet());
app.use(express.json());

app.use(
	cors({
		origin: process.env.CORS_ORIGIN
			? process.env.CORS_ORIGIN.split(",").map((s) => s.trim())
			: "*",
		methods: ["GET", "POST"],
		allowedHeaders: ["Content-Type", "x-api-key"],
	})
);

const adminLimiter = rateLimit({
	windowMs: 60_000,
	max: 10,
	standardHeaders: true,
	legacyHeaders: false,
});

app.get("/health", (req, res) => {
	res.json({ ok: true, env: process.env.NODE_ENV || "development" });
});

app.get("/admin/server/list", apiKeyAuth, adminLimiter, async (req, res) => {
	try {
		const list = await listPm2();
		const data = list.map((p) => ({
			name: p.name,
			pm_id: p.pm_id,
			status: p.pm2_env?.status,
			restart_time: p.pm2_env?.restart_time,
			uptime_ms: Date.now() - (p.pm2_env?.pm_uptime || Date.now()),
			memory: p.monit?.memory,
			cpu: p.monit?.cpu,
		}));
		res.json({ processes: data });
	} catch (e) {
		res.status(500).json({
			error: "No se pudo obtener la lista",
			detail: String(e?.message || e),
		});
	}
});

app.post(
	"/admin/server/restart",
	apiKeyAuth,
	adminLimiter,
	async (req, res) => {
		const appName = (req.body?.name || process.env.PM2_APP_NAME || "").trim();
		if (!appName) {
			return res
				.status(400)
				.json({ error: "Falta el nombre de la app (name)" });
		}

		try {
			await restartPm2App(appName);
			res.json({ ok: true, message: `Reinicio solicitado para "${appName}"` });
		} catch (e) {
			res.status(500).json({
				ok: false,
				error: `No se pudo reiniciar "${appName}"`,
				detail: String(e?.message || e),
			});
		}
	}
);

const port = Number(process.env.PORT || 3001);
app.listen(port, () => {
	console.log(`Admin server escuchando en :${port}`);
});
