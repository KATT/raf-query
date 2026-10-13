// @vitest-environment-options {"settings":{"enableJavaScriptEvaluation":true,"suppressInsecureJavaScriptEnvironmentWarning":true}}
import { describe, expect, it } from "@effect/vitest";
import {
	createRootRoute,
	createRoute,
	createRouter,
	HeadContent,
	Scripts,
} from "@tanstack/react-router";
import {
	createRequestHandler,
	defaultStreamHandler,
} from "@tanstack/react-router/ssr/server";
import { Predicate } from "effect";
import { type ReactNode, Suspense, use } from "react";

import {
	type DehydratedState,
	Query,
	QueryClient,
	QueryClientProvider,
	queryOptions,
	useQuery,
	useWaterfall,
} from "./index.ts";
import type { DehydratedRouterQueries } from "./tanstack-router-shared.ts";
import { setupRouterIntegration } from "./tanstack-router.ts";
import { flush } from "./test-utils.ts";

declare global {
	/** Set by TanStack Router's inline scripts. */
	var $_TSR:
		| { readonly router: { readonly dehydratedData: DehydratedRouterQueries } }
		| undefined;
}

/** Requests that settle after `id` × 5 ms; a negative id fails. */
function createBackend() {
	const calls: Array<number> = [];
	function issueQuery(input: { id: number }) {
		return queryOptions({
			queryFn: async () => {
				calls.push(input.id);
				await new Promise((resolve) => {
					setTimeout(resolve, Math.abs(input.id) * 5);
				});
				if (input.id < 0) {
					throw new Error("Database password is hunter2");
				}
				return { createdAt: new Date(input.id), title: `Issue ${input.id}` };
			},
			queryKey: ["issue", input.id],
			retry: false,
		});
	}
	return { calls, issueQuery };
}

type Backend = ReturnType<typeof createBackend>;

function Issue(props: { readonly backend: Backend; readonly id: number }) {
	const handle = useWaterfall(props.backend.issueQuery, { id: props.id });
	const [issuePromise] = useQuery(props.backend.issueQuery, handle);
	return <p>{use(issuePromise).title}</p>;
}

/** Starts a query during render that nothing on the server reads. */
function Prefetch(props: { readonly backend: Backend; readonly id: number }) {
	useWaterfall(props.backend.issueQuery, { id: props.id });
	return null;
}

function inlineScripts(html: string, includes: (source: string) => boolean) {
	return [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
		.map((match) => match[1] ?? "")
		.filter(includes);
}

/** Execute scripts in the page, in order, as the HTML parser would. */
function runScripts(sources: ReadonlyArray<string>) {
	for (const source of sources) {
		const script = document.createElement("script");
		script.textContent = source;
		document.body.append(script);
		script.remove();
	}
}

describe("TanStack Router setupRouterIntegration", () => {
	/** A TanStack Start-like server render of `page`, through the router's own serializer. */
	async function renderHtml(
		backend: Backend,
		client: QueryClient,
		page: () => ReactNode,
	) {
		const handler = createRequestHandler({
			createRouter: () => {
				const rootRoute = createRootRoute({
					component: () => (
						<html lang="en">
							<head>
								<HeadContent />
							</head>
							<body>
								{page()}
								<Scripts />
							</body>
						</html>
					),
				});
				const indexRoute = createRoute({
					getParentRoute: () => rootRoute,
					loader: () => {
						client.prefetch(backend.issueQuery, { id: 1 });
					},
					path: "/",
				});
				const router = createRouter({
					isServer: true,
					routeTree: rootRoute.addChildren([indexRoute]),
					Wrap: (props) => (
						<QueryClientProvider client={client}>
							{props.children}
						</QueryClientProvider>
					),
				});
				setupRouterIntegration({ queryClient: client, router });
				return router;
			},
			request: new Request("http://localhost/"),
		});
		const response = await handler(defaultStreamHandler);
		return response.text();
	}

	/** Run the router's scripts and take the query payload they deserialize. */
	function receivePayload(html: string): DehydratedRouterQueries {
		runScripts(
			inlineScripts(
				html,
				(source) => source.includes("$_TSR") || source.includes("($R=>"),
			),
		);
		const payload = globalThis.$_TSR?.router.dehydratedData;
		Reflect.deleteProperty(globalThis, "$_TSR");
		Reflect.deleteProperty(globalThis, "$R");
		if (!payload) {
			throw new Error("The HTML has no router payload");
		}
		return payload;
	}

	async function readAll(stream: ReadableStream<DehydratedState>) {
		const reader = stream.getReader();
		const states: Array<DehydratedState> = [];
		for (;;) {
			const next = await reader.read();
			if (next.done) {
				return states;
			}
			states.push(next.value);
		}
	}

	it("sends pending entries as promises through the router's serializer, each entry once", async () => {
		const backend = createBackend();
		const server = new QueryClient({ isServer: true });
		server.setData(
			backend.issueQuery,
			{ id: 3 },
			{
				createdAt: new Date(3),
				title: "Cached",
			},
		);
		const html = await renderHtml(backend, server, () => (
			<>
				<Suspense fallback={<p>Loading</p>}>
					<Issue backend={backend} id={1} />
				</Suspense>
				<Suspense fallback={<p>Loading</p>}>
					<Issue backend={backend} id={2} />
				</Suspense>
				<Suspense fallback={<p>Loading</p>}>
					<Issue backend={backend} id={1} />
				</Suspense>
				<Prefetch backend={backend} id={-1} />
			</>
		));
		expect(html).not.toContain("hunter2");

		const payload = receivePayload(html);
		const [streamed, forBrowser] = payload.raf.stream.tee();
		const browser = new QueryClient({ isServer: false });
		const browserRouter = createRouter({
			isServer: false,
			routeTree: createRootRoute(),
		});
		setupRouterIntegration({ queryClient: browser, router: browserRouter });
		await browserRouter.options.hydrate?.({
			raf: { initial: payload.raf.initial, stream: forBrowser },
		});
		const sent = [payload.raf.initial, ...(await readAll(streamed))].flatMap(
			(state) => state.queries,
		);
		await flush();

		expect(sent.map((query) => query.key)).toEqual([
			["issue", 3],
			["issue", 1],
			["issue", 2],
			["issue", -1],
		]);
		expect(sent.map((query) => Predicate.isPromise(query.promise))).toEqual([
			false,
			true,
			true,
			true,
		]);
		expect(browser.getData(backend.issueQuery, { id: 1 })).toEqual({
			createdAt: new Date(1),
			title: "Issue 1",
		});
		expect(browser.getData(backend.issueQuery, { id: 2 })).toEqual({
			createdAt: new Date(2),
			title: "Issue 2",
		});
		expect(browser.getData(backend.issueQuery, { id: 3 })?.title).toBe(
			"Cached",
		);
		const failed = Query.getUnsafe(
			browser.getQuery(backend.issueQuery, { id: -1 }),
		);
		expect(String(failed.error)).toBe('Error: Query ["issue",-1] failed');
		expect(backend.calls).toEqual([1, 2, -1]);
	});
});
