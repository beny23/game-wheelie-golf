import { defineConfig } from "vite";

declare const process: { env?: Record<string, string | undefined> };

const basePath = process?.env?.BASE_PATH ?? "/game-wheelie-golf/";

export default defineConfig({
  // Ensure assets resolve correctly when hosted under a subpath (e.g. /game-wheelie-golf/).
  base: basePath,
  build: {
    sourcemap: true,
  },
});
