import { defineConfig } from "vite";

export default defineConfig({
  // Ensure assets resolve correctly when hosted under a subpath (e.g. /game-wheelie-golf/).
  base: process.env.BASE_PATH || "/game-wheelie-golf/",
  build: {
    sourcemap: true,
  },
});
