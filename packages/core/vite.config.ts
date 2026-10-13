import { defineConfig } from "vite-plus";

export default defineConfig({
	test: {
		clearMocks: true,
		coverage: {
			include: ["src"],
			reporter: ["html", "lcov"],
		},
		exclude: ["dist", "node_modules"],
		unstubGlobals: true,
	},
});
