import { fileURLToPath } from "node:url";

import { getRequestListener } from "@hono/node-server";
import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig, type Plugin } from "vite";

import type { CreateHandler } from "./src/server/handler.ts";

/**
 * Serves pages and the API from Vite's dev server: each request no Vite
 * middleware answered goes to `src/server/handler.ts`, loaded through Vite so
 * edits apply on the next request.
 */
function devServer(): Plugin {
	return {
		configureServer(server) {
			const listener = getRequestListener(async (request) => {
				const module = await server.ssrLoadModule("/src/server/handler.ts");
				const createHandler: CreateHandler = module["createHandler"];
				return createHandler({
					scripts: ["/@vite/client", "/src/entry-client.ts"],
					styles: ["/src/app.css"],
				}).fetch(request);
			});
			return () => {
				server.middlewares.use((req, res, next) => {
					listener(req, res).catch(next);
				});
			};
		},
		name: "issues-dev-server",
	};
}

export default defineConfig({
	appType: "custom",
	builder: {},
	environments: {
		client: {
			build: {
				manifest: true,
				outDir: "dist/client",
				rolldownOptions: { input: "src/entry-client.ts" },
			},
		},
		ssr: {
			build: {
				outDir: "dist/server",
				rolldownOptions: { input: { server: "src/server.ts" } },
			},
		},
	},
	plugins: [tailwindcss(), vue(), devServer()],
	resolve: {
		alias: { "@": fileURLToPath(new URL("src", import.meta.url)) },
	},
	ssr: { noExternal: [/^@examples\//, /^@raf-query\//, "vue-sonner"] },
});
