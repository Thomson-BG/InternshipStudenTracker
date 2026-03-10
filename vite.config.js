const { defineConfig } = require("vite");

module.exports = defineConfig({
  server: {
    host: "127.0.0.1",
    port: 4173
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
