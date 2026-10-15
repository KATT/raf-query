import { configDefaults, defineConfig } from "vite-plus";

export default defineConfig({
	pack: {
		entry: [
			"workspace.ts",
			"anti-slop/index.ts",
			"anti-slop/effect/index.ts",
			"nkzw/index.ts",
		],
		format: "esm",
		outExtensions: () => ({ js: ".js" }),
	},
	test: {
		exclude: ["dist", "node_modules"],
		forceRerunTriggers: [
			...configDefaults.forceRerunTriggers,
			"**/pnpm-lock.yaml",
			"**/pnpm-workspace.yaml",
		],
		include: ["**/*.test.ts"],
	},
});
