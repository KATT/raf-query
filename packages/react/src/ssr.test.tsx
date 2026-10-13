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
import { act, cleanup, render, screen } from "@testing-library/react";
import { Predicate } from "effect";
import { ServerInsertedHTMLContext } from "next/dist/shared/lib/server-inserted-html.shared-runtime.js";
import {
	Component,
	Fragment,
	type ReactNode,
	StrictMode,
	Suspense,
	use,
} from "react";
import {
	renderToReadableStream,
	renderToStaticMarkup,
} from "react-dom/server.edge";

import {
	type DehydratedState,
	Query,
	QueryClient,
	QueryClientProvider,
	queryOptions,
	useQuery,
	useWaterfall,
} from "./index.ts";
import { QueryProvider } from "./next.tsx";
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

/** Reads a query without starting it during render. */
function Read(props: { readonly backend: Backend; readonly id: number }) {
	const [issuePromise] = useQuery(props.backend.issueQuery, {
		input: { id: props.id },
		key: ["issue", props.id],
	});
	return <p>{use(issuePromise).title}</p>;
}

/** Starts a query during render that nothing on the server reads. */
function Prefetch(props: { readonly backend: Backend; readonly id: number }) {
	useWaterfall(props.backend.issueQuery, { id: props.id });
	return null;
}

interface BoundaryState {
	readonly error: unknown;
}

class Boundary extends Component<{ readonly children: ReactNode }> {
	override state: BoundaryState = { error: null };
	static getDerivedStateFromError(error: unknown) {
		return { error };
	}
	override render() {
		return this.state.error === null
			? this.props.children
			: `Error: ${String(this.state.error)}`;
	}
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

async function mount(ui: ReactNode) {
	return act(async () => render(ui));
}

describe("Next.js QueryProvider", () => {
	/**
	 * Render a document as Next.js does: before each chunk React flushes, and
	 * once at the end, write what the `useServerInsertedHTML` callbacks return.
	 */
	async function renderHtml(ui: ReactNode) {
		const callbacks: Array<() => ReactNode> = [];
		const insert = () =>
			renderToStaticMarkup(
				callbacks.map((callback, index) => (
					<Fragment key={index}>{callback()}</Fragment>
				)),
			);
		const stream = await renderToReadableStream(
			<ServerInsertedHTMLContext
				value={(callback) => {
					callbacks.push(callback);
				}}
			>
				<html lang="en">
					<body>{ui}</body>
				</html>
			</ServerInsertedHTMLContext>,
		);
		const reader = stream.getReader();
		const decoder = new TextDecoder();
		let html = "";
		for (;;) {
			const next = await reader.read();
			if (next.done) {
				return html + insert();
			}
			html += insert() + decoder.decode(next.value, { stream: true });
		}
	}

	function streamScripts(html: string) {
		return inlineScripts(html, (source) => source.includes("RAF_QUERY_SSR"));
	}

	function chunkOf(source: string): {
		readonly queries: ReadonlyArray<{
			readonly key: unknown;
			readonly promise?: number;
		}>;
		readonly settled: ReadonlyArray<unknown>;
	} {
		return JSON.parse(source.slice(source.indexOf(".push(") + 6, -1));
	}

	/** The browser is still parsing the streamed document until `finish()`. */
	function loadingDocument() {
		globalThis.RAF_QUERY_SSR = undefined;
		Object.defineProperty(document, "readyState", {
			configurable: true,
			value: "loading",
		});
		return {
			finish() {
				Reflect.deleteProperty(document, "readyState");
				document.dispatchEvent(new Event("DOMContentLoaded"));
				globalThis.RAF_QUERY_SSR = undefined;
			},
		};
	}

	/** Run the script `QueryProvider` writes for `chunk`. */
	function pushChunk(chunk: unknown) {
		runScripts([
			`(self.RAF_QUERY_SSR=self.RAF_QUERY_SSR||[]).push(${JSON.stringify(chunk)})`,
		]);
	}

	it("streams pending entries as promises a later script settles, each entry once", async () => {
		const backend = createBackend();
		const html = await renderHtml(
			<QueryProvider config={{ isServer: true }}>
				<Suspense fallback={<p>Loading</p>}>
					<Issue backend={backend} id={1} />
				</Suspense>
				<Prefetch backend={backend} id={2} />
				<Suspense fallback={<p>Loading</p>}>
					<Issue backend={backend} id={1} />
				</Suspense>
			</QueryProvider>,
		);
		const scripts = streamScripts(html);
		const chunks = scripts.map(chunkOf);

		expect(chunks[0]?.queries).toEqual([
			{ key: ["issue", 1], promise: 0, updatedAt: 0 },
			{ key: ["issue", 2], promise: 1, updatedAt: 0 },
		]);
		expect(chunks.slice(1).flatMap((chunk) => chunk.queries)).toEqual([]);
		// Nothing on the server reads issue 2, but the HTML waits for it.
		expect(chunks.flatMap((chunk) => chunk.settled)).toEqual([
			{ data: { createdAt: new Date(1).toJSON(), title: "Issue 1" }, id: 0 },
			{ data: { createdAt: new Date(2).toJSON(), title: "Issue 2" }, id: 1 },
		]);
		expect(html.indexOf('"id":0')).toBeLessThan(html.indexOf("Issue 1</p>"));

		const page = loadingDocument();
		runScripts(scripts.slice(0, 1));
		await mount(
			<QueryProvider config={{ isServer: false }}>
				<Suspense fallback={<p>Loading</p>}>
					<Issue backend={backend} id={1} />
					<Issue backend={backend} id={2} />
				</Suspense>
			</QueryProvider>,
		);
		expect(screen.getByText("Loading")).toBeDefined();
		await act(async () => {
			runScripts(scripts.slice(1));
			await flush();
		});
		page.finish();

		expect(screen.getByText("Issue 1")).toBeDefined();
		expect(screen.getByText("Issue 2")).toBeDefined();
		expect(backend.calls).toEqual([1, 2]);
		cleanup();
	});

	it("streams a failed request as a rejection, without its error", async () => {
		const backend = createBackend();
		const html = await renderHtml(
			<QueryProvider config={{ isServer: true }}>
				<Prefetch backend={backend} id={-1} />
			</QueryProvider>,
		);
		const scripts = streamScripts(html);
		expect(html).not.toContain("hunter2");

		const page = loadingDocument();
		runScripts(scripts);
		await mount(
			<QueryProvider config={{ isServer: false }}>
				<Boundary>
					<Suspense fallback={<p>Loading</p>}>
						<Issue backend={backend} id={-1} />
					</Suspense>
				</Boundary>
			</QueryProvider>,
		);
		page.finish();

		expect(
			screen.getByText('Error: Error: Query ["issue",-1] failed'),
		).toBeDefined();
		expect(backend.calls).toEqual([-1]);
		cleanup();
	});

	it("rejects promises the response ended without settling", async () => {
		const backend = createBackend();
		const page = loadingDocument();
		pushChunk({ queries: [{ key: ["issue", 1], promise: 0, updatedAt: 0 }] });
		await mount(
			<QueryProvider config={{ isServer: false }}>
				<Boundary>
					<Suspense fallback={<p>Loading</p>}>
						<Issue backend={backend} id={1} />
					</Suspense>
				</Boundary>
			</QueryProvider>,
		);
		expect(screen.getByText("Loading")).toBeDefined();
		await act(async () => {
			page.finish();
			await flush();
		});

		expect(
			screen.getByText(
				`Error: Error: Query ["issue",1] was still loading when the server's response ended`,
			),
		).toBeDefined();
		expect(backend.calls).toEqual([]);
		cleanup();
	});

	it("hydrates chunks streamed before and after it mounts", async () => {
		const backend = createBackend();
		const page = loadingDocument();
		pushChunk({
			queries: [
				{ data: { title: "Streamed" }, key: ["issue", 1], updatedAt: 1 },
			],
		});
		const ui = (ids: ReadonlyArray<number>) => (
			<QueryProvider config={{ isServer: false }}>
				{ids.map((id) => (
					<Read backend={backend} id={id} key={id} />
				))}
			</QueryProvider>
		);
		const result = await mount(ui([1]));
		pushChunk({
			queries: [{ data: { title: "Later" }, key: ["issue", 2], updatedAt: 1 }],
		});
		await act(async () => {
			result.rerender(ui([1, 2]));
		});
		page.finish();

		expect(screen.getByText("Streamed")).toBeDefined();
		expect(screen.getByText("Later")).toBeDefined();
		expect(backend.calls).toEqual([]);
		cleanup();
	});

	it("hands the stream to the client React keeps when it creates two", async () => {
		const backend = createBackend();
		const page = loadingDocument();
		pushChunk({ queries: [{ key: ["issue", 1], promise: 0, updatedAt: 0 }] });
		// Strict Mode calls the state initializer twice and keeps the first.
		await mount(
			<StrictMode>
				<QueryProvider config={{ isServer: false }}>
					<Suspense fallback={<p>Loading</p>}>
						<Issue backend={backend} id={1} />
					</Suspense>
				</QueryProvider>
			</StrictMode>,
		);
		await act(async () => {
			pushChunk({
				queries: [],
				settled: [{ data: { title: "Issue 1" }, id: 0 }],
			});
			page.finish();
			await flush();
		});

		expect(screen.getByText("Issue 1")).toBeDefined();
		expect(backend.calls).toEqual([]);
		cleanup();
	});
});

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
