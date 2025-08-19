const pm2 = require("pm2");
const { execFile } = require("child_process");

function restartPm2App(appName) {
	return new Promise((resolve, reject) => {
		pm2.connect((err) => {
			if (err) return reject(err);

			pm2.restart(appName, (restartErr, procs) => {
				pm2.disconnect();
				if (restartErr) return reject(restartErr);
				resolve(procs);
			});
		});
	});
}

function listPm2() {
	return new Promise((resolve, reject) => {
		pm2.connect((err) => {
			if (err) return reject(err);

			pm2.list((listErr, list) => {
				pm2.disconnect();
				if (listErr) return reject(listErr);
				resolve(list);
			});
		});
	});
}

function describeApp(appName) {
	return new Promise((resolve, reject) => {
		pm2.connect((err) => {
			if (err) return reject(err);

			pm2.describe(appName, (descErr, desc) => {
				pm2.disconnect();
				if (descErr) return reject(descErr);
				resolve(Array.isArray(desc) && desc.length ? desc[0] : null);
			});
		});
	});
}

async function getLogPaths(appName) {
	const proc = await describeApp(appName);
	if (!proc) throw new Error(`No se encontró la app "${appName}" en PM2`);

	console.log({
		env: proc.pm2_env,
	});

	const out = proc.pm2_env && proc.pm2_env.pm_out_log_path;
	const err = proc.pm2_env && proc.pm2_env.pm_err_log_path;
	return { out, err };
}

function tailFile(filePath, lines = 200) {
	return new Promise((resolve, reject) => {
		if (!filePath) return resolve("");
		execFile(
			"tail",
			["-n", String(lines), filePath],
			{ maxBuffer: 10 * 1024 * 1024 },
			(err, stdout, stderr) => {
				if (err) {
					if (stderr && /No such file|cannot open/i.test(String(stderr))) {
						return resolve("");
					}
					return reject(err);
				}
				resolve(stdout.toString("utf8"));
			}
		);
	});
}

function openPm2Bus() {
	return new Promise((resolve, reject) => {
		pm2.launchBus((err, bus) => {
			if (err) return reject(err);
			resolve(bus);
		});
	});
}

module.exports = {
	restartPm2App,
	listPm2,
	describeApp,
	getLogPaths,
	tailFile,
	openPm2Bus,
};
