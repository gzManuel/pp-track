// pm2 process definition — versioned here so the production process config is
// reproducible instead of living only as unversioned state on the server.
// Deploy runs: pm2 startOrReload apps/server/ecosystem.config.cjs --update-env
module.exports = {
  apps: [
    {
      name: "pp-api",
      script: "dist/index.js",
      cwd: __dirname,
      instances: 1,
      // The app handles SIGTERM/SIGINT for graceful Prisma shutdown.
      kill_timeout: 5000,
      max_restarts: 10,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
