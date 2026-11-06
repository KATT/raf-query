import { defineConfig } from "vite-plus";

export default defineConfig({
	pack: {
		entry: ["src/index.tsx"],
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
		environment: "happy-dom",
		exclude: ["dist", "node_modules"],
		setupFiles: ["./vitest.setup.ts"],
		unstubGlobals: true,
	},
});
