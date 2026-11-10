import { defineConfig } from "vite-plus";

export default defineConfig({
	test: {
		environment: "node",
		globalSetup: ["./src/build-app.ts"],
		include: ["src/**/*.test.ts"],
		unstubEnvs: true,
	},
});
