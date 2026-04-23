const { defineConfig } = require("vite");

module.exports = defineConfig({
  server: {
    host: "127.0.0.1",
    port: 4173,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.DEV_API_PORT || "4301"}`,
        changeOrigin: true
      }
    }
  },
  preview: {
    host: "127.0.0.1",
    port: 4173
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2020"
  }
});
