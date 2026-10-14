import { defineConfig } from "vite-plus";

// Separate from `vite.config.ts`, whose Start and markdown plugins compile the
// whole site.
export default defineConfig({
	resolve: {
		tsconfigPaths: true,
	},
	test: {
		environment: "happy-dom",
		include: ["{build,src}/**/*.test.{ts,tsx}"],
		unstubGlobals: true,
	},
});
