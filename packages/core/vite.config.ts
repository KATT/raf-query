import { defineConfig } from "vite-plus";

const react = (file: string) =>
	new URL(`../react/src/${file}`, import.meta.url).pathname;

export default defineConfig({
	pack: {
		entry: ["src/index.ts", "src/internal.ts"],
		// Without the tests, whose `@raf-query/react` path would pull React's
		// source into the declaration build.
		tsconfig: "tsconfig.no-node.json",
		unbundle: true,
	},
	test: {
		// Core's tests read queries through React's hooks, from source. Not a
		// dependency: react depends on core, and pnpm refuses workspace cycles.
		alias: [{ find: /^@raf-query\/react$/, replacement: react("index.ts") }],
		clearMocks: true,
		coverage: {
			exclude: [
				"src/**/*.test.{ts,tsx}",
				"src/**/*.test-d.{ts,tsx}",
				"src/test-utils.{ts,tsx}",
			],
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
		restoreMocks: true,
		setupFiles: ["./vitest.setup.ts"],
		unstubEnvs: true,
		unstubGlobals: true,
	},
});
