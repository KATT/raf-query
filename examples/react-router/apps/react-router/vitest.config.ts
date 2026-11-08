import { defineConfig } from "vite-plus";

// Apart from `vite.config.ts`: the React Router plugin builds the app, which tests don't need.
export default defineConfig({
	resolve: {
		tsconfigPaths: true,
	},
	test: {
		include: ["app/**/*.test.ts"],
	},
});
