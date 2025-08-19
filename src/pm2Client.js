const pm2 = require("pm2");

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

module.exports = { restartPm2App, listPm2 };
