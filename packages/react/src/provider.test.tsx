import { act, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
	bindUseQueryClient,
	createQueryClient,
	type Feature,
	load,
	prefetch,
	QueryClientProvider,
	useIsFetching,
	useQueryClient,
	waterfallHandle,
} from "./index.ts";
import {
	createBackend,
	issues,
	renderWith,
	testClient,
} from "./test-utils.tsx";

describe("QueryClientProvider", () => {
	it("runs the client's features while mounted", () => {
		const signals: Array<AbortSignal> = [];
		const feature: Feature = (_client, signal) => {
			signals.push(signal);
		};
		const client = testClient({ features: [feature] });
		const view = render(<QueryClientProvider client={client} />);
		expect(signals.map((signal) => signal.aborted)).toEqual([false]);
		view.unmount();
		expect(signals.map((signal) => signal.aborted)).toEqual([true]);
	});

	it("starts the features once for providers that share a client, and stops them with the last", () => {
		const signals: Array<AbortSignal> = [];
		const feature: Feature = (_client, signal) => {
			signals.push(signal);
		};
		const client = testClient({ features: [feature] });
		const first = render(<QueryClientProvider client={client} />);
		const second = render(<QueryClientProvider client={client} />);
		expect(signals.map((signal) => signal.aborted)).toEqual([false]);
		first.unmount();
		expect(signals.map((signal) => signal.aborted)).toEqual([false]);
		second.unmount();
		expect(signals.map((signal) => signal.aborted)).toEqual([true]);
		render(<QueryClientProvider client={client} />).unmount();
		expect(signals.map((signal) => signal.aborted)).toEqual([true, true]);
	});

	it("useQueryClient throws outside a provider", () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		function Reader() {
			useQueryClient();
			return null;
		}
		expect(() => render(<Reader />)).toThrow(/no QueryClientProvider/u);
	});

	it("gives a bound useQueryClient the provider's client", () => {
		const makeQueryClient = () => testClient();
		const useRootClient = bindUseQueryClient<typeof makeQueryClient>();
		const client = makeQueryClient();
		function Reader() {
			return <p>{String(useRootClient() === client)}</p>;
		}
		render(
			<QueryClientProvider client={client}>
				<Reader />
			</QueryClientProvider>,
		);
		expect(screen.getByText("true")).toBeTruthy();
	});
});

describe("the react-server entry", () => {
	it("throws from each hook, saying it reads in client components", async () => {
		const server = await import("./index-react-server.ts");
		const backend = createBackend();
		const message =
			/reads in client components: move this into a file with "use client"/u;
		expect(() =>
			server.useQuery(
				backend.issueQuery,
				waterfallHandle(backend.issueQuery, { id: 1 }),
			),
		).toThrow(message);
		expect(() =>
			server.useInfiniteQuery(
				backend.pageQuery,
				waterfallHandle(backend.pageQuery, { size: 2 }),
			),
		).toThrow(message);
		expect(() => server.useIsFetching()).toThrow(message);
		expect(() => server.useQueryClient()).toThrow(message);
		expect(server.bindUseQueryClient()).toBe(server.useQueryClient);
		expect(server.QueryClientProvider).toBe(QueryClientProvider);
		expect(server.load).toBe(load);
	});
});

describe("useIsFetching", () => {
	it("counts requests in flight, for a target or all", async () => {
		const backend = createBackend();
		const client = createQueryClient({ isServer: false });
		function Count() {
			return (
				<p>
					{useIsFetching()} {useIsFetching(issues)}{" "}
					{useIsFetching(backend.titleQuery)}
				</p>
			);
		}
		await renderWith(client, <Count />);
		expect(screen.getByText("0 0 0")).toBeTruthy();
		await act(async () => {
			await load(client, {
				one: prefetch(backend.issueQuery, { id: 1 }),
				two: prefetch(backend.issueQuery, { id: 2 }),
			});
		});
		expect(screen.getByText("2 2 0")).toBeTruthy();
		await backend.respondAll();
		expect(screen.getByText("0 0 0")).toBeTruthy();
	});

	it("renders 0 on the server, so hydration matches", async () => {
		const backend = createBackend();
		const client = createQueryClient({ isServer: true });
		await load(client, {
			one: prefetch(backend.issueQuery, { id: 1 }),
		});
		function Count() {
			return <p>{useIsFetching()}</p>;
		}

		expect(
			renderToString(
				<QueryClientProvider client={client}>
					<Count />
				</QueryClientProvider>,
			),
		).toBe("<p>0</p>");
	});
});
