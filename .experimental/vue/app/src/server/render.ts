import { AsyncLocalStorage } from "node:async_hooks";

import { logoUrl } from "@examples/kit/lib/logo";
import { dehydrate } from "@raf-query/experimental-vue";
import { renderToString } from "vue/server-renderer";

import { createApp } from "../app.ts";
import type { Boot, BootQuery, StreamedResult } from "../boot.ts";
import { readSettings, setRequestHeaders } from "../lib/settings.ts";

/** The client build's entry script and stylesheets. */
export interface Assets {
	readonly scripts: ReadonlyArray<string>;
	readonly styles: ReadonlyArray<string>;
}

const requestHeaders = new AsyncLocalStorage<Record<string, string>>();
setRequestHeaders(() => requestHeaders.getStore() ?? {});

/** JSON that can sit inside a `<script>`. */
function scriptJson(value: Boot | StreamedResult) {
	return JSON.stringify(value).replaceAll("<", String.raw`\u003c`);
}

function settleScript(id: number, result: StreamedResult) {
	return `<script>rafQueryBoot.settle(${id}, ${scriptJson(result)})</script>`;
}

// Runs before the page paints, so it never flashes the other theme.
const themeScript = `(() => { const media = matchMedia("(prefers-color-scheme: dark)"); const apply = () => { document.documentElement.classList.toggle("dark", media.matches); document.documentElement.classList.toggle("light", !media.matches); }; apply(); media.addEventListener("change", apply); })()`;

// Collects the results streamed after the HTML until the app reads them.
const bootScript = `window.rafQueryBoot = Object.assign(BOOT, { settled: {}, waiting: {}, settle(id, result) { const waiting = this.waiting[id]; if (waiting) { delete this.waiting[id]; waiting(result); } else { this.settled[id] = result; } } });`;

/**
 * Render the page at `request`'s URL. The loader runs first, under the URL's
 * verb: `ensure` and `fetch` wait, so the HTML has the data. Under `prefetch`
 * the HTML has skeletons, and each query's result streams after it as a
 * `<script>` once it lands; the browser hydrates while they arrive.
 */
export function renderPage(request: Request, assets: Assets) {
	const url = new URL(request.url);
	const cookie = request.headers.get("cookie") ?? "";
	return requestHeaders.run(cookie ? { cookie } : {}, async () => {
		const settings = readSettings(cookie);
		const page = createApp({ isServer: true, settings });
		await page.router.push(`${url.pathname}${url.search}`);
		const route = page.router.currentRoute.value;
		if (route.redirectedFrom && route.name !== "not-found") {
			return Response.redirect(new URL(route.fullPath, url), 302);
		}
		// Snapshot the cache in the same tick the render reads it: the app's
		// components are synchronous, so the whole tree renders before
		// `renderToString` first awaits, and no query settles in between.
		const state = dehydrate(page.queryClient);
		const html = await renderToString(page.app);
		const pending: Array<Promise<string>> = [];
		const queries = state.queries.map((query, id): BootQuery => {
			const { promise, ...sent } = query;
			if (!promise) {
				return sent;
			}
			pending.push(
				// The dehydrated promise already redacts the error.
				promise.then(
					(value) => settleScript(id, { value } satisfies StreamedResult),
					() =>
						settleScript(id, {
							error: "The query failed",
						} satisfies StreamedResult),
				),
			);
			return { ...sent, pending: id };
		});
		const boot: Boot = {
			load:
				route.meta.loaderData === undefined
					? undefined
					: { data: route.meta.loaderData, fullPath: route.fullPath },
			queries,
		};
		const head = [
			`<!doctype html><html lang="en"><head>`,
			`<meta charset="utf-8" />`,
			`<meta content="width=device-width, initial-scale=1" name="viewport" />`,
			`<title>Issues · raf-query on Vue</title>`,
			`<link href="${logoUrl}" rel="icon" type="image/svg+xml" />`,
			`<script>${themeScript}</script>`,
			...assets.styles.map(
				(href) => `<link href="${href}" rel="stylesheet" />`,
			),
			`</head><body class="min-h-screen antialiased">`,
			`<div id="app">${html}</div>`,
			`<script>${bootScript.replace("BOOT", scriptJson(boot))}</script>`,
			// `async`: hydrate as soon as the script loads, not after the
			// streamed results.
			...assets.scripts.map(
				(src) => `<script async src="${src}" type="module"></script>`,
			),
		].join("");
		const encoder = new TextEncoder();
		const body = new ReadableStream<Uint8Array>({
			async start(controller) {
				controller.enqueue(encoder.encode(head));
				await Promise.all(
					pending.map((chunk) =>
						chunk.then((script) => {
							controller.enqueue(encoder.encode(script));
						}),
					),
				);
				controller.enqueue(encoder.encode("</body></html>"));
				controller.close();
			},
		});
		return new Response(body, {
			headers: { "content-type": "text/html; charset=utf-8" },
			status: route.name === "not-found" ? 404 : 200,
		});
	});
}
