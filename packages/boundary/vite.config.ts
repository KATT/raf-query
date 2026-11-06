import { defineConfig } from "vite-plus";

export default defineConfig({
	pack: {
		entry: ["src/index.tsx"],
		unbundle: true,
	},
	test: {
		clearMocks: true,
		coverage: {
			include: ["src"],
			reporter: ["html", "lcov", "text-summary"],
			thresholds: { 100: true },
		},
		environment: "happy-dom",
		exclude: ["dist", "node_modules"],
		setupFiles: ["./vitest.setup.ts"],
		unstubGlobals: true,
	},
});
