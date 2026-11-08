import { act, fireEvent, screen } from "@testing-library/react";
import { Profiler, use } from "react";
import { describe, expect, it, vi } from "vitest";

import {
	fetchEntry,
	load,
	prefetchEntry,
	type QueryHandle,
	setData,
	useInfiniteQuery,
	useIsFetching,
	useQuery,
} from "./index.ts";
import {
	createBackend,
	flush,
	type Issue,
	renderWith,
	testClient,
} from "./test-utils.tsx";

type Backend = ReturnType<typeof createBackend>;

/** Fetch the query again, settle it, and wait for the write. Its data doesn't change. */
async function refetched(
	backend: Backend,
	start: () => Promise<unknown>,
	whileFetching: () => void = () => {},
) {
	let done!: Promise<unknown>;
	await act(async () => {
		done = start();
		await flush();
	});
	whileFetching();
	await backend.respondAll();
	await done;
}

async function prefetched<THandle>(
	backend: Backend,
	start: () => Promise<THandle>,
): Promise<THandle> {
	const done = start();
	await backend.respondAll();
	return done;
}

describe("hooks compiled by the React Compiler", () => {
	it("render every write to a query", async () => {
		// The compiler caches render values in slots of its memo cache, `$[i]`.
		expect(String(useQuery)).toMatch(/\$\[\d+\]/);
		const backend = createBackend();
		const client = testClient();
		const handle = await prefetched(backend, async () => {
			const [handles] = await load(client, {
				issue: prefetchEntry(backend.issueQuery, { id: 1 }),
			});
			return handles.issue;
		});
		function Title(props: {
			readonly handle: QueryHandle<Backend["issueQuery"]>;
		}) {
			const [issueThenable] = useQuery(backend.issueQuery, props.handle);
			const issue = use(issueThenable);
			return <p>{issue.title}</p>;
		}
		await renderWith(client, <Title handle={handle} />);
		expect(screen.getByText("First")).toBeTruthy();
		for (const title of ["Second write", "Third write"]) {
			await act(async () => {
				setData(client, backend.issueQuery, { id: 1 }, (issue?: Issue) => ({
					id: issue?.id ?? 1,
					title,
				}));
				await flush();
			});
			expect(screen.getByText(title)).toBeTruthy();
		}
	});

	it("render every page a paged query fetches, and whether one is loading", async () => {
		expect(String(useInfiniteQuery)).toMatch(/\$\[\d+\]/);
		const backend = createBackend();
		const client = testClient();
		const handle = await prefetched(backend, async () => {
			const [handles] = await load(client, {
				pages: prefetchEntry(backend.pageQuery, { size: 1 }),
			});
			return handles.pages;
		});
		function Pages(props: {
			readonly handle: QueryHandle<Backend["pageQuery"]>;
		}) {
			const [pagesThenable, controls] = useInfiniteQuery(
				backend.pageQuery,
				props.handle,
				{
					whilePending: "previous",
				},
			);
			const data = use(pagesThenable);
			return (
				<>
					<p>pages {data.pages.flat().join(",")}</p>
					<p>{controls.isFetchingNextPage ? "loading next" : "idle"}</p>
					<button onClick={() => void controls.fetchNextPage()} type="button">
						next
					</button>
				</>
			);
		}
		await renderWith(client, <Pages handle={handle} />);
		expect(screen.getByText("pages 1")).toBeTruthy();
		for (const shown of ["pages 1,2", "pages 1,2,3"]) {
			await act(async () => {
				fireEvent.click(screen.getByText("next"));
				await flush();
			});
			expect(screen.getByText("loading next")).toBeTruthy();
			await backend.respondAll();
			expect(screen.getByText(shown)).toBeTruthy();
			expect(screen.getByText("idle")).toBeTruthy();
		}
	});

	it("re-render only for the state fields a component read, and track a field from its first read", async () => {
		const backend = createBackend();
		const client = testClient();
		const handle = await prefetched(backend, async () => {
			const [handles] = await load(client, {
				issue: prefetchEntry(backend.issueQuery, { id: 1 }),
			});
			return handles.issue;
		});
		const refetch = () =>
			load(client, { issue: fetchEntry(backend.issueQuery, { id: 1 }) });
		function Title(props: {
			readonly handle: QueryHandle<Backend["issueQuery"]>;
			readonly showFetching: boolean;
		}) {
			const [issueThenable, controls] = useQuery(
				backend.issueQuery,
				props.handle,
			);
			const issue = use(issueThenable);
			return (
				<p>
					{issue.title}
					{props.showFetching ? ` fetching ${String(controls.isFetching)}` : ""}
				</p>
			);
		}
		const renders = vi.fn();
		const view = await renderWith(
			client,
			<Profiler id="title" onRender={renders}>
				<Title handle={handle} showFetching={false} />
			</Profiler>,
		);
		renders.mockClear();
		await refetched(backend, refetch);
		expect(renders).not.toHaveBeenCalled();

		await view.rerender(
			<Profiler id="title" onRender={renders}>
				<Title handle={handle} showFetching />
			</Profiler>,
		);
		expect(screen.getByText("First fetching false")).toBeTruthy();
		renders.mockClear();
		await refetched(backend, refetch, () => {
			expect(screen.getByText("First fetching true")).toBeTruthy();
		});
		expect(screen.getByText("First fetching false")).toBeTruthy();
		expect(renders).toHaveBeenCalledTimes(2);
	});

	it("re-render a page list only for the page fields it read", async () => {
		const backend = createBackend();
		const client = testClient();
		const handle = await prefetched(backend, async () => {
			const [handles] = await load(client, {
				pages: prefetchEntry(backend.pageQuery, { size: 1 }),
			});
			return handles.pages;
		});
		function Pages(props: {
			readonly handle: QueryHandle<Backend["pageQuery"]>;
		}) {
			const [pagesThenable, controls] = useInfiniteQuery(
				backend.pageQuery,
				props.handle,
			);
			const data = use(pagesThenable);
			return (
				<p>
					pages {data.pages.flat().join(",")}{" "}
					{controls.hasNextPage ? "more" : "end"}
				</p>
			);
		}
		const renders = vi.fn();
		await renderWith(
			client,
			<Profiler id="pages" onRender={renders}>
				<Pages handle={handle} />
			</Profiler>,
		);
		expect(screen.getByText("pages 1 more")).toBeTruthy();
		renders.mockClear();
		await refetched(backend, () =>
			load(client, { pages: fetchEntry(backend.pageQuery, { size: 1 }) }),
		);
		expect(renders).not.toHaveBeenCalled();
		expect(screen.getByText("pages 1 more")).toBeTruthy();
	});

	it("count every request in flight", async () => {
		const backend = createBackend();
		const client = testClient();
		function Fetching() {
			return <p>fetching {useIsFetching()}</p>;
		}
		await renderWith(client, <Fetching />);
		expect(screen.getByText("fetching 0")).toBeTruthy();
		for (let round = 0; round < 2; round++) {
			let done!: Promise<unknown>;
			await act(async () => {
				done = load(client, {
					issue: fetchEntry(backend.issueQuery, { id: 1 }),
				});
				await flush();
			});
			expect(screen.getByText("fetching 1")).toBeTruthy();
			await backend.respondAll();
			await done;
			expect(screen.getByText("fetching 0")).toBeTruthy();
		}
	});
});
