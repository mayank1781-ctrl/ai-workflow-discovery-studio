// PM2 process manager config. Used by the pm2:* npm scripts to run the
// Discovery Studio server with automatic restart on crash. CommonJS (.cjs)
// because package.json sets "type": "module".
module.exports = {
  apps: [
    {
      name: "discovery-studio",
      script: "server.mjs",
      watch: false,
      env: {
        PORT: 5177
      }
    }
  ]
};
