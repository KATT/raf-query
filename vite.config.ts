import { defineConfig } from "vite-plus";

export default defineConfig({
	fmt: {
		embeddedLanguageFormatting: "auto",
		ignorePatterns: [
			".husky/**",
			"coverage/**",
			"**/dist/**",
			"pnpm-lock.yaml",
			".repos/**",
		],
		printWidth: 80,
		sortPackageJson: false,
		useTabs: true,
	},
});
