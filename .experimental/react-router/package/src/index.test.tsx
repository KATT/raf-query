import {
	dehydrate,
	Query,
	QueryClient,
	QueryClientProvider,
	queryOptions,
	useQuery,
} from "@raf-query/react";
import { act, render } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToReadableStream } from "react-dom/server.edge";
import { describe, expect, it } from "vitest";

import { HydrationBoundary } from "./index.tsx";

function createBackend() {
	const calls: Array<number> = [];
	let version = 0;
	function issueQuery(input: { id: number }) {
		return queryOptions({
			queryFn: async () => {
				calls.push(input.id);
				version++;
				return { title: `Issue ${input.id} v${version}` };
			},
			queryKey: ["issue", input.id],
			retry: false,
		});
	}
	return { calls, issueQuery };
}

function flush() {
	return new Promise<void>((resolve) => {
		setTimeout(resolve, 0);
	});
}

describe("HydrationBoundary", () => {
	it("hydrates a loader's dehydrated state into the browser client", async () => {
		const backend = createBackend();
		const loader = new QueryClient({ isServer: true });
		const handle = await loader.ensure(backend.issueQuery, { id: 1 });
		const state = dehydrate(loader);

		function Show() {
			const [issue] = useQuery(backend.issueQuery, handle);
			return <p>{issue.title}</p>;
		}

		const stream = await renderToReadableStream(
			<QueryClientProvider client={new QueryClient({ isServer: true })}>
				<HydrationBoundary state={state}>
					<Show />
				</HydrationBoundary>
			</QueryClientProvider>,
		);
		await stream.allReady;
		const html = await new Response(stream).text();
		expect(html).toContain("Issue 1 v1</p>");
		expect(backend.calls).toEqual([1]);

		const container = document.createElement("div");
		container.innerHTML = html;
		document.body.append(container);
		const browser = new QueryClient({ isServer: false });
		const root = await act(async () =>
			hydrateRoot(
				container,
				<QueryClientProvider client={browser}>
					<HydrationBoundary state={state}>
						<Show />
					</HydrationBoundary>
				</QueryClientProvider>,
			),
		);
		await act(flush);

		expect(container.textContent).toBe("Issue 1 v1");
		expect(backend.calls).toEqual([1]);
		expect(
			Query.getUnsafe(browser.getQuery(backend.issueQuery, { id: 1 })).hasData,
		).toBe(true);
		act(() => root.unmount());
		container.remove();
	});

	it("writes newer data for an entry on screen after commit", async () => {
		const backend = createBackend();
		const browser = new QueryClient({
			defaults: { staleTime: Number.POSITIVE_INFINITY },
			isServer: false,
		});
		const handle = await browser.ensure(backend.issueQuery, { id: 1 });
		// Hydration only takes strictly newer `updatedAt`s.
		await new Promise((resolve) => {
			setTimeout(resolve, 2);
		});
		const loader = new QueryClient({ isServer: true });
		await loader.ensure(backend.issueQuery, { id: 1 });
		const state = dehydrate(loader);

		const rendered: Array<string> = [];
		function Show() {
			const [issue] = useQuery(backend.issueQuery, handle);
			rendered.push(issue.title);
			return <p>{issue.title}</p>;
		}

		const view = render(
			<QueryClientProvider client={browser}>
				<HydrationBoundary state={state}>
					<Show />
				</HydrationBoundary>
			</QueryClientProvider>,
		);
		await act(flush);

		expect(rendered[0]).toBe("Issue 1 v1");
		expect(view.container.textContent).toBe("Issue 1 v2");
		expect(backend.calls).toEqual([1, 1]);
		view.unmount();
	});
});
