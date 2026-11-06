import { defineConfig } from "vite-plus";

export default defineConfig({
	pack: {
		entry: [
			"src/index.ts",
			"src/index-react-server.ts",
			"src/devtools.tsx",
			"src/hydration.ts",
			"src/tanstack-router.ts",
			"src/tanstack-router-browser.ts",
		],
		unbundle: true,
	},
	test: {
		clearMocks: true,
		coverage: {
			exclude: ["src/test-utils.tsx"],
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
