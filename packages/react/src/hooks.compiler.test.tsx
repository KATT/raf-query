import { act, fireEvent, screen } from "@testing-library/react";
import { use } from "react";
import { describe, expect, it } from "vitest";

import {
	fetchEntry,
	load,
	prefetchEntry,
	type QueryHandle,
	setData,
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
			const [promise] = useQuery(backend.issueQuery, props.handle);
			const issue = use(promise);
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

	it("render every page a paged query fetches", async () => {
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
			const [promise, controls] = useQuery(backend.pageQuery, props.handle, {
				whilePending: "previous",
			});
			const data = use(promise);
			return (
				<>
					<p>pages {data.pages.flat().join(",")}</p>
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
			await backend.respondAll();
			expect(screen.getByText(shown)).toBeTruthy();
		}
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
