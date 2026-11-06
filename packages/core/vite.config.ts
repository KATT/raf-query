import { defineConfig } from "vite-plus";

export default defineConfig({
	pack: {
		entry: [
			"src/index.ts",
			"src/groups.ts",
			"src/hydration.ts",
			"src/internal.ts",
		],
		unbundle: true,
	},
	test: {
		clearMocks: true,
		coverage: {
			include: ["src"],
			reporter: ["html", "lcov", "text-summary"],
			thresholds: { 100: true },
		},
		exclude: ["dist", "node_modules"],
		unstubGlobals: true,
	},
});
