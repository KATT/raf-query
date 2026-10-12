import { defineConfig } from "vite-plus";

export default defineConfig({
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
