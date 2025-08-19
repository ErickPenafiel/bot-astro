const crypto = require("crypto");

function timingSafeEqual(a, b) {
	const bufA = Buffer.from(a || "");
	const bufB = Buffer.from(b || "");
	if (bufA.length !== bufB.length) return false;
	return crypto.timingSafeEqual(bufA, bufB);
}

function apiKeyAuth(req, res, next) {
	const provided = req.header("x-api-key") || "";
	const expected = process.env.API_KEY || "";
	if (!expected) {
		return res
			.status(500)
			.json({ error: "API key no configurada en el servidor" });
	}
	if (!timingSafeEqual(provided, expected)) {
		return res.status(401).json({ error: "No autorizado" });
	}
	next();
}

module.exports = { apiKeyAuth };
