import {
	createQueryClient,
	type Feature,
	load,
	prefetchEntry,
} from "@raf-query/core";
import { act, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { QueryClientProvider, useQueryClient } from "./provider.tsx";
import { QueryProvider } from "./query-provider.tsx";
import {
	createBackend,
	issues,
	renderWith,
	testClient,
} from "./test-utils.tsx";
import { useIsFetching } from "./use-is-fetching.ts";

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
	it("creates a browser-only client from config", () => {
		const seen: Array<boolean | undefined> = [];
		function Reader() {
			const client = useQueryClient();
			seen.push(client["~browserOnly"]);
			return <p>{String(client.isServer)}</p>;
		}
		renderToString(
			<QueryProvider config={{ isServer: true }}>
				<Reader />
			</QueryProvider>,
		);
		render(
			<QueryProvider>
				<Reader />
			</QueryProvider>,
		);
		expect(seen).toEqual([true, true]);
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
});
