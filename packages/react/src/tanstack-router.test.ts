import {
	createQueryClient,
	getData,
	load,
	prefetchEntry,
	queryOptions,
	setData,
} from "@raf-query/core";
import {
	type AnyRouter,
	createRootRoute,
	createRoute,
	createRouter,
	redirect,
} from "@tanstack/react-router";
import { describe, expect, it, vi } from "vitest";

import { setupRouterIntegration as setupBrowser } from "./tanstack-router-browser.ts";
import { setupRouterIntegration } from "./tanstack-router.ts";
import { createBackend, flush, issues } from "./test-utils.tsx";

function routerFor(isServer: boolean) {
	const rootRoute = createRootRoute();
	const loginRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/login",
	});
	return createRouter({
		isServer,
		routeTree: rootRoute.addChildren([loginRoute]),
	});
}

interface ServerSsr {
	readonly cleanups: Array<() => void>;
	readonly renderFinished: Array<() => void>;
}

/** What TanStack Start does around a server render. */
function attachServerSsr(router: AnyRouter): ServerSsr {
	const ssr: ServerSsr = { cleanups: [], renderFinished: [] };
	const serverSsr = {
		onCleanup: (listener: () => void) => ssr.cleanups.push(listener),
		onRenderFinished: (listener: () => void) =>
			ssr.renderFinished.push(listener),
	};
	Object.assign(router, { serverSsr });
	for (const attach of router.serverSsrLifecycle?.onServerSsrAttach ?? []) {
		attach(
			/* SAFETY: the integration only calls `onCleanup`. */ serverSsr as never,
		);
	}
	return ssr;
}

function runAll(listeners: ReadonlyArray<() => void>) {
	for (const listener of listeners) {
		listener();
	}
}

describe("setupRouterIntegration", () => {
	it("sends the cache with the router state, then streams later entries", async () => {
		const backend = createBackend();
		const server = createQueryClient({ isServer: true });
		const browser = createQueryClient({ isServer: false });
		const serverRouter = routerFor(true);
		setupRouterIntegration({ queryClient: server, router: serverRouter });
		const ssr = attachServerSsr(serverRouter);
		const browserRouter = routerFor(false);
		setupRouterIntegration({ queryClient: browser, router: browserRouter });

		setData(server, backend.issueQuery, { id: 1 }, { id: 1, title: "Cached" });
		await load(server, { two: prefetchEntry(backend.issueQuery, { id: 2 }) });
		const dehydrated = await serverRouter.options.dehydrate?.();
		await browserRouter.options.hydrate?.(dehydrated ?? {});
		backend.store.set(3, { id: 3, title: "Third" });
		await load(server, { three: prefetchEntry(backend.issueQuery, { id: 3 }) });
		await flush();
		for (const request of backend.requests.splice(0)) {
			request.respond();
		}
		await flush();
		runAll(ssr.renderFinished);
		await flush();

		expect(getData(browser, backend.issueQuery, { id: 1 })?.title).toBe(
			"Cached",
		);
		expect(getData(browser, backend.issueQuery, { id: 2 })?.title).toBe(
			"Second",
		);
		expect(getData(browser, backend.issueQuery, { id: 3 })?.title).toBe(
			"Third",
		);

		runAll(ssr.cleanups);
		expect(server["~entries"].size).toBe(0);
	});

	it("clears the cache and sends nothing when the request ended before dehydrating", async () => {
		const backend = createBackend();
		const server = createQueryClient({ isServer: true });
		const router = routerFor(true);
		setupRouterIntegration({ queryClient: server, router });
		const ssr = attachServerSsr(router);
		runAll(ssr.cleanups);
		setData(server, backend.issueQuery, { id: 1 }, { id: 1, title: "Late" });
		await expect(router.options.dehydrate?.()).resolves.toBeUndefined();
		expect(server["~entries"].size).toBe(0);
	});

	it("keeps the router's own hydration, and ignores state it didn't send", async () => {
		const original = vi.fn();
		const browser = createQueryClient({ isServer: false });
		const router = routerFor(false);
		router.options.hydrate = original;
		setupBrowser({ queryClient: browser, router });
		await router.options.hydrate({ other: true });
		expect(original).toHaveBeenCalledWith({ other: true });
		expect(browser["~entries"].size).toBe(0);
	});

	it("reports a broken stream", async () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const browser = createQueryClient({ isServer: false });
		const router = routerFor(false);
		setupBrowser({ queryClient: browser, router });
		const stream = new ReadableStream({
			start(controller) {
				controller.error(new Error("cut"));
			},
		});
		await router.options.hydrate?.({
			raf: { initial: { entries: [] }, stream },
		});
		await flush();
		expect(error).toHaveBeenCalledWith(
			expect.stringContaining("query stream"),
			new Error("cut"),
		);
	});

	it("navigates once when a queryFn throws redirect()", async () => {
		const browser = createQueryClient({ isServer: false });
		const router = routerFor(false);
		const navigate = vi.spyOn(router, "navigate").mockResolvedValue();
		setupRouterIntegration({ queryClient: browser, router });
		const privateQuery = () =>
			queryOptions({
				queryFn: () => {
					throw redirect({ to: "/login" });
				},
				queryKey: [issues, "private"],
			});
		await load(browser, { secret: prefetchEntry(privateQuery) });
		await flush();
		expect(navigate).toHaveBeenCalledOnce();
		expect(navigate.mock.calls[0]?.[0]).toMatchObject({ to: "/login" });
	});

	it("leaves redirects alone with handleRedirects: false", async () => {
		const browser = createQueryClient({ isServer: false });
		const router = routerFor(false);
		const navigate = vi.spyOn(router, "navigate").mockResolvedValue();
		setupRouterIntegration({
			handleRedirects: false,
			queryClient: browser,
			router,
		});
		const privateQuery = () =>
			queryOptions({
				queryFn: () => {
					throw redirect({ to: "/login" });
				},
				queryKey: [issues, "private"],
			});
		await load(browser, { secret: prefetchEntry(privateQuery) });
		await flush();
		expect(navigate).not.toHaveBeenCalled();
	});
});
