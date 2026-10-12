import { defineConfig } from "vite-plus";

export default defineConfig({
	pack: {
		entry: [
			"src/index.ts",
			"src/devtools.tsx",
			"src/devtools-production.tsx",
			"src/next.tsx",
			"src/rsc.tsx",
			"src/tanstack-router.ts",
		],
		unbundle: true,
	},
	test: {
		clearMocks: true,
		coverage: {
			include: ["src"],
			reporter: ["html", "lcov"],
		},
		environment: "happy-dom",
		exclude: ["dist", "node_modules"],
		unstubGlobals: true,
	},
});
