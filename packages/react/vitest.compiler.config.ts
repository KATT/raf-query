import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

// The hooks compiled by the React Compiler, as an app that compiles this
// package's sources (Next.js `transpilePackages`, a monorepo) runs them.
// Coverage stays with the plain run: compiled code has branches of its own.
export default defineConfig({
	plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
	test: {
		clearMocks: true,
		environment: "happy-dom",
		include: ["src/**/*.compiler.test.tsx"],
		setupFiles: ["./vitest.setup.ts"],
		unstubGlobals: true,
	},
});
