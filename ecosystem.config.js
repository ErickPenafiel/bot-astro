module.exports = {
	apps: [
		{
			name: "app",
			script: "./app.js",
			instances: "1",
			exec_mode: "fork",
			env: {
				NODE_ENV: "development",
			},
			env_production: {
				NODE_ENV: "production",
			},
		},
	],
};
