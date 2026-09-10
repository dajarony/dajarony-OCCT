import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/dajarony-OCCT/",
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        circuito: resolve(__dirname, "circuito.html"),
      },
    },
  },
});
