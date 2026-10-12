import { defineConfig } from "vite-plus";

export default defineConfig({
	defaultPackage: {
		pack: "./packages/raf-query",
		test: "./packages/raf-query",
	},
	fmt: {
		useTabs: true,
		printWidth: 80,
		sortPackageJson: false,
		embeddedLanguageFormatting: "auto",
		ignorePatterns: [
			".husky/**",
			"coverage/**",
			"**/dist/**",
			"pnpm-lock.yaml",
			".repos/**",
		],
	},
});
