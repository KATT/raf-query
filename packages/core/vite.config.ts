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
			exclude: ["src/**/*.test.{ts,tsx}", "src/test-utils.{ts,tsx}"],
			include: ["src/**/*.{ts,tsx}"],
			reporter: ["html", "lcov", "text-summary"],
			thresholds: {
				branches: 100,
				functions: 100,
				lines: 100,
				statements: 100,
			},
		},
		exclude: ["dist", "node_modules"],
		unstubGlobals: true,
	},
});
