import { fileURLToPath } from "node:url"
import { configDefaults, defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./test/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // OpenReel's own sources and tests, fetched by scripts/build-openreel.mjs.
    exclude: [...configDefaults.exclude, ".cache/**", "editor/**", "public/editor/**"],
  },
})
