import { act, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
	createQueryClient,
	type Feature,
	load,
	prefetchEntry,
	QueryClientProvider,
	QueryProvider,
	useIsFetching,
	useQuery,
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

	it("useQueryClient throws outside a provider", () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		function Reader() {
			useQueryClient();
			return null;
		}
		expect(() => render(<Reader />)).toThrow(/no QueryClientProvider/u);
	});
});

describe("QueryProvider", () => {
	it("makes a client from config that loads queries in the browser", async () => {
		const backend = createBackend();
		const handle = waterfallHandle(backend.issueQuery, { id: 1 });
		function Issue() {
			const [, controls] = useQuery(backend.issueQuery, handle);
			return <p>{String(controls.isFetching)}</p>;
		}
		render(
			<QueryProvider config={{ staleTime: 1000 }}>
				<Issue />
			</QueryProvider>,
		);

		expect(screen.getByText("true")).toBeTruthy();
		await backend.respondAll();
		expect(screen.getByText("false")).toBeTruthy();
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
				one: prefetchEntry(backend.issueQuery, { id: 1 }),
				two: prefetchEntry(backend.issueQuery, { id: 2 }),
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
			one: prefetchEntry(backend.issueQuery, { id: 1 }),
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
