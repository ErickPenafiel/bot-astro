require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { apiKeyAuth } = require("./auth");
const {
	restartPm2App,
	listPm2,
	getLogPaths,
	tailFile,
} = require("./pm2Client");

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

app.get("/admin/server/logs", apiKeyAuth, adminLimiter, async (req, res) => {
	const name =
		String(req.query.name || "").trim() || process.env.PM2_APP_NAME || "";
	const type = String(req.query.type || "out").toLowerCase();
	const lines = Math.min(
		Math.max(parseInt(req.query.lines, 10) || 200, 1),
		2000
	);

	if (!name) return res.status(400).json({ error: 'Falta query param "name"' });

	try {
		const { out, err } = await getLogPaths(name);

		if (type === "out") {
			const outTxt = await tailFile(out, lines);
			return res.json({
				name,
				type: "out",
				lines,
				outLogPath: out,
				out: outTxt,
			});
		}
		if (type === "err") {
			const errTxt = await tailFile(err, lines);
			return res.json({
				name,
				type: "err",
				lines,
				errLogPath: err,
				err: errTxt,
			});
		}

		const [outTxt, errTxt] = await Promise.all([
			tailFile(out, lines),
			tailFile(err, lines),
		]);
		return res.json({
			name,
			type: "all",
			lines,
			outLogPath: out,
			errLogPath: err,
			out: outTxt,
			err: errTxt,
		});
	} catch (e) {
		res.status(500).json({
			error: "No se pudieron leer los logs",
			detail: String(e?.message || e),
		});
	}
});

app.get(
	"/admin/pm2/server/download",
	apiKeyAuth,
	adminLimiter,
	async (req, res) => {
		const name =
			String(req.query.name || "").trim() || process.env.PM2_APP_NAME || "";
		const type = String(req.query.type || "out").toLowerCase();

		if (!name)
			return res.status(400).json({ error: 'Falta query param "name"' });

		try {
			const { out, err } = await getLogPaths(name);
			const filePath = type === "err" ? err : out;

			if (!filePath || !fs.existsSync(filePath)) {
				return res.status(404).json({ error: "Archivo de log no encontrado" });
			}

			res.download(filePath, path.basename(filePath));
		} catch (e) {
			res.status(500).json({
				error: "No se pudo descargar el log",
				detail: String(e?.message || e),
			});
		}
	}
);

app.get("/admin/server/logs/stream", apiKeyAuth, async (req, res) => {
	const name =
		String(req.query.name || "").trim() || process.env.PM2_APP_NAME || "";
	const type = String(req.query.type || "both").toLowerCase();

	if (!name) return res.status(400).json({ error: 'Falta query param "name"' });

	res.setHeader("Content-Type", "text/event-stream");
	res.setHeader("Cache-Control", "no-cache, no-transform");
	res.setHeader("Connection", "keep-alive");
	res.flushHeaders?.();

	let bus;
	let keepAliveTimer;

	const send = (evt) => res.write(`data: ${JSON.stringify(evt)}\n\n`);
	const ping = () => res.write(`: ping\n\n`);

	try {
		bus = await openPm2Bus();

		const onOut = (packet) => {
			if (
				packet?.process?.name === name &&
				(type === "out" || type === "both")
			) {
				send({ type: "out", name, line: String(packet.data || "") });
			}
		};
		const onErr = (packet) => {
			if (
				packet?.process?.name === name &&
				(type === "err" || type === "both")
			) {
				send({ type: "err", name, line: String(packet.data || "") });
			}
		};

		bus.on("log:out", onOut);
		bus.on("log:err", onErr);

		keepAliveTimer = setInterval(ping, 15000);

		req.on("close", () => {
			try {
				clearInterval(keepAliveTimer);
			} catch (_) {}
			try {
				bus.off("log:out", onOut);
				bus.off("log:err", onErr);
				bus.close?.();
			} catch (_) {}
			res.end();
		});

		send({
			type: "info",
			message: `Streaming de logs iniciado para "${name}" (${type})`,
		});
	} catch (e) {
		res.write(
			`data: ${JSON.stringify({
				type: "error",
				message: String(e?.message || e),
			})}\n\n`
		);
		return res.end();
	}
});

const port = Number(process.env.PORT_SERVER || 3001);

app.listen(port, () => {
	console.log(`Admin server escuchando en :${port}`);
});
