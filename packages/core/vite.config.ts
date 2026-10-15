import { configDefaults, defineConfig } from "vite-plus";

export default defineConfig({
	pack: {
		entry: ["src/index.ts"],
		unbundle: true,
	},
	test: {
		clearMocks: true,
		coverage: {
			include: ["src"],
			reporter: ["html", "lcov"],
		},
		exclude: ["dist", "node_modules"],
		forceRerunTriggers: [
			...configDefaults.forceRerunTriggers,
			"**/pnpm-lock.yaml",
			"**/pnpm-workspace.yaml",
		],
		unstubGlobals: true,
	},
});
