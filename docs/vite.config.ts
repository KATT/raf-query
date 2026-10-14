import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { docPages, docsContent } from "./build/content.ts";
import { sections, site } from "./src/site.ts";

const contentDir = new URL("content", import.meta.url).pathname;
const demosDir = new URL("src/demos", import.meta.url).pathname;

export default defineConfig({
	plugins: [
		docsContent({ contentDir, demosDir, sections, siteUrl: site.url }),
		tailwindcss(),
		tanstackStart({
			pages: [
				{ path: "/", sitemap: { changefreq: "weekly", priority: 1 } },
				...docPages(contentDir).map((page) => ({
					path: page.path,
					sitemap: {
						changefreq: "weekly" as const,
						lastmod: page.lastModified,
						priority: 0.8,
					},
				})),
				{
					path: "/404",
					prerender: { enabled: true, outputPath: "/404.html" },
					sitemap: { exclude: true },
				},
			],
			prerender: {
				crawlLinks: true,
				enabled: true,
				failOnError: true,
				filter: (page) => page.path !== "/docs",
			},
			sitemap: { enabled: true, host: site.url },
		}),
		react(),
		babel({ presets: [reactCompilerPreset()] }),
	],
	resolve: {
		tsconfigPaths: true,
	},
});
