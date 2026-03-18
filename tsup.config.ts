import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    "bin/hatchery": "bin/hatchery.ts",
    index: "src/index.ts",
  },
  format: ["esm"],
  target: "node18",
  clean: true,
  dts: true,
  sourcemap: true,
  splitting: false,
  banner: {
    js: "#!/usr/bin/env node",
  },
});
