import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";

const repositoryRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL("./src/renderer", import.meta.url)),
  base: "./",
  build: {
    outDir: fileURLToPath(new URL("./dist/renderer", import.meta.url)),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@shared": `${repositoryRoot}src/shared`,
    },
  },
  worker: {
    format: "es",
  },
});
