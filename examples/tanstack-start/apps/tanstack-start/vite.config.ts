import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		tailwindcss(),
		tanstackStart(),
		react(),
		babel({ presets: [reactCompilerPreset()] }),
	],
	resolve: {
		tsconfigPaths: true,
	},
	server: {
		// CodeSandbox serves the dev server at `<id>-<port>.csb.app`.
		allowedHosts: [".csb.app"],
	},
});
