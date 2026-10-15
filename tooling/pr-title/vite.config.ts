import { configDefaults, defineConfig } from "vite-plus";

export default defineConfig({
	test: {
		forceRerunTriggers: [
			...configDefaults.forceRerunTriggers,
			"**/.release-it.json",
			"**/pnpm-lock.yaml",
			"**/pnpm-workspace.yaml",
		],
		include: ["src/**/*.test.ts"],
	},
});
