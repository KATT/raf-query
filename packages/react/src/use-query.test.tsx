import {
	createQueryClient,
	ensureEntry,
	fetchEntry,
	invalidateOne,
	load,
	prefetchEntry,
	QueryDisabledError,
	type QueryHandle,
	setData,
	type Thenable,
	waterfallHandle,
} from "@raf-query/core";
import { act, fireEvent, screen } from "@testing-library/react";
import { Suspense, use } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { QueryClientProvider } from "./provider.tsx";
import {
	createBackend,
	flush,
	type Issue,
	renderWith,
	testClient,
} from "./test-utils.tsx";
import { useQuery } from "./use-query.ts";

type Backend = ReturnType<typeof createBackend>;

function IssueTitle(props: { readonly issue: Issue }) {
	return <p>{props.issue.title}</p>;
}

async function loaded(backend: Backend, run: () => Promise<void>) {
	const done = run();
	await backend.respondAll();
	await done;
}

describe("useQuery", () => {
	it("returns the data for a defined handle", async () => {
		const backend = createBackend();
		const client = testClient();
		let handle: QueryHandle<Backend["issueQuery"]> & { readonly defined: true };
		await loaded(backend, async () => {
			[{ issue: handle }] = await load(client, {
				issue: fetchEntry(backend.issueQuery, { id: 1 }),
			});
		});
		function Issue() {
			const [issue, controls] = useQuery(backend.issueQuery, handle);
			return (
				<p>
					{issue.title} {controls.hash} {String(controls.isPending)}
				</p>
			);
		}
		await renderWith(client, <Issue />);
		expect(screen.getByText(/First/u).textContent).toContain("false");
	});

	it("returns a thenable for a prefetch handle", async () => {
		const backend = createBackend();
		const client = testClient();
		const [handles] = await load(client, {
			issue: prefetchEntry(backend.issueQuery, { id: 2 }),
		});
		function Issue() {
			const [issue] = useQuery(backend.issueQuery, handles.issue);
			return <IssueTitle issue={use(issue)} />;
		}
		await renderWith(client, <Issue />);
		expect(screen.getByText("loading")).toBeTruthy();
		await backend.respondAll();
		expect(screen.getByText("Second")).toBeTruthy();
	});

	it("starts a waterfall handle's query when it renders, without a warning", async () => {
		const backend = createBackend();
		const client = testClient();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const handle = waterfallHandle(backend.issueQuery, { id: 1 });
		function Issue() {
			const [issue] = useQuery(backend.issueQuery, handle);
			return <IssueTitle issue={use(issue)} />;
		}
		await renderWith(client, <Issue />);
		expect(backend.requests).toHaveLength(1);
		await backend.respondAll();
		expect(screen.getByText("First")).toBeTruthy();
		expect(warn).not.toHaveBeenCalled();
	});

	it("warns when a read starts a query nothing loaded", async () => {
		const backend = createBackend();
		const client = testClient();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const handle = {
			input: { id: 1 },
			queryKey: backend.issueQuery({ id: 1 }).queryKey,
		};
		function Issue() {
			const [issue] = useQuery(backend.issueQuery, handle);
			return <IssueTitle issue={use(issue)} />;
		}
		await renderWith(client, <Issue />);
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining("read before anything loaded it"),
		);
		await backend.respondAll();
		expect(screen.getByText("First")).toBeTruthy();
	});

	it("applies select", async () => {
		const backend = createBackend();
		const client = testClient();
		let handles!: {
			readonly title: QueryHandle<Backend["titleQuery"]> & {
				readonly defined: true;
			};
		};
		await loaded(backend, async () => {
			[handles] = await load(client, {
				title: ensureEntry(backend.titleQuery, { id: 1 }),
			});
		});
		function Title() {
			const [title] = useQuery(backend.titleQuery, handles.title);
			return <p>{title}</p>;
		}
		await renderWith(client, <Title />);
		expect(screen.getByText("FIRST")).toBeTruthy();
	});

	it("reads a refetched, invalidated entry when it mounts", async () => {
		const backend = createBackend();
		const client = testClient();
		let handles!: {
			readonly issue: QueryHandle<Backend["issueQuery"]> & {
				readonly defined: true;
			};
		};
		await loaded(backend, async () => {
			[handles] = await load(client, {
				issue: fetchEntry(backend.issueQuery, { id: 1 }),
			});
		});
		void invalidateOne(client, backend.issueQuery, { id: 1 });
		function Issue() {
			const [issue, controls] = useQuery(backend.issueQuery, handles.issue);
			return (
				<p>
					{issue.title} {controls.isFetching ? "fetching" : "idle"}
				</p>
			);
		}
		await renderWith(client, <Issue />);
		await act(flush);
		expect(screen.getByText(/First/u).textContent).toContain("fetching");
		backend.store.set(1, { id: 1, title: "Renamed" });
		await backend.respondAll();
		expect(screen.getByText(/Renamed/u).textContent).toContain("idle");
	});

	it("refetches on request", async () => {
		const backend = createBackend();
		const client = testClient();
		let handles!: {
			readonly issue: QueryHandle<Backend["issueQuery"]> & {
				readonly defined: true;
			};
		};
		await loaded(backend, async () => {
			[handles] = await load(client, {
				issue: fetchEntry(backend.issueQuery, { id: 1 }),
			});
		});
		const settled = vi.fn();
		function Issue() {
			const [issue, controls] = useQuery(backend.issueQuery, handles.issue);
			return (
				<button
					onClick={() => void controls.refetch().then(settled)}
					type="button"
				>
					{issue.title}
				</button>
			);
		}
		await renderWith(client, <Issue />);
		backend.store.set(1, { id: 1, title: "Again" });
		fireEvent.click(screen.getByText("First"));
		await backend.respondAll();
		expect(settled).toHaveBeenCalledWith(undefined);
		expect(screen.getByText("Again")).toBeTruthy();
	});

	describe("result: true", () => {
		function Read(props: {
			readonly backend: Backend;
			readonly handle: QueryHandle<Backend["issueQuery"]>;
		}) {
			const [read] = useQuery(props.backend.issueQuery, props.handle, {
				result: true,
			});
			const result = use(read);
			return (
				<p>{result.ok ? result.value.title : `failed ${result.error._tag}`}</p>
			);
		}

		it("reads data as ok", async () => {
			const backend = createBackend();
			const client = testClient();
			const [handles] = await load(client, {
				issue: prefetchEntry(backend.issueQuery, { id: 1 }),
			});
			await renderWith(
				client,
				<Read backend={backend} handle={handles.issue} />,
			);
			await backend.respondAll();
			expect(screen.getByText("First")).toBeTruthy();
		});

		it("reads a fail() value as an error result, settled or pending", async () => {
			const backend = createBackend();
			const client = testClient();
			const [handles] = await load(client, {
				issue: prefetchEntry(backend.issueQuery, { id: 9 }),
			});
			const view = await renderWith(
				client,
				<Read backend={backend} handle={handles.issue} />,
			);
			await backend.respondAll();
			expect(screen.getByText("failed NotFound")).toBeTruthy();
			view.unmount();
			await renderWith(
				client,
				<Read backend={backend} handle={handles.issue} />,
			);
			expect(screen.getByText("failed NotFound")).toBeTruthy();
		});

		it("still throws defects, settled or pending", async () => {
			const backend = createBackend();
			const client = testClient();
			vi.spyOn(console, "error").mockImplementation(() => {});
			const [handles] = await load(client, {
				issue: prefetchEntry(backend.issueQuery, { id: 1 }),
			});
			const errors: Array<unknown> = [];
			const thenables: Array<Thenable<unknown>> = [];
			function Capture() {
				const [read] = useQuery(backend.issueQuery, handles.issue, {
					result: true,
				});
				thenables.push(read);
				return null;
			}
			await renderWith(client, <Capture />);
			await act(async () => {
				backend.requests.splice(0)[0]?.fail(new Error("boom"));
				await flush();
			});
			await thenables[0]?.then(undefined, (error: unknown) =>
				errors.push(error),
			);
			await renderWith(client, <Capture />);
			await thenables
				.at(-1)
				?.then(undefined, (error: unknown) => errors.push(error));
			expect(errors).toEqual([new Error("boom"), new Error("boom")]);
		});
	});

	it("keeps the previous data with whilePending: previous", async () => {
		const backend = createBackend();
		const client = testClient();
		setData(client, backend.issueQuery, { id: 1 }, { id: 1, title: "First" });
		function Issue(props: { readonly id: number }) {
			const [issue, controls] = useQuery(
				backend.issueQuery,
				waterfallHandle(backend.issueQuery, { id: props.id }),
				{ whilePending: "previous" },
			);
			const value = use(issue);
			return (
				<p>
					{value.title} {String(controls.isPrevious)}
				</p>
			);
		}
		const view = await renderWith(client, <Issue id={1} />);
		expect(screen.getByText("First false")).toBeTruthy();
		await view.rerender(<Issue id={2} />);
		expect(screen.getByText("First true")).toBeTruthy();
		await backend.respondAll();
		expect(screen.getByText("Second false")).toBeTruthy();
	});

	it("pages through a paged query", async () => {
		const backend = createBackend();
		const client = testClient();
		let handles!: {
			readonly pages: QueryHandle<Backend["pageQuery"]> & {
				readonly defined: true;
			};
		};
		await loaded(backend, async () => {
			[handles] = await load(client, {
				pages: fetchEntry(backend.pageQuery, { size: 2 }),
			});
		});
		const settled = vi.fn();
		function Pages() {
			const [data, controls] = useQuery(backend.pageQuery, handles.pages);
			return (
				<>
					<p>{data.pages.flat().join(",")}</p>
					<p>
						{String(controls.hasPreviousPage)} {String(controls.hasNextPage)}
					</p>
					<p>
						{String(controls.isFetchingPreviousPage)}{" "}
						{String(controls.isFetchingNextPage)}
					</p>
					<button
						onClick={() => void controls.fetchNextPage().then(settled)}
						type="button"
					>
						next
					</button>
					<button
						onClick={() => void controls.fetchPreviousPage().then(settled)}
						type="button"
					>
						previous
					</button>
				</>
			);
		}
		await renderWith(client, <Pages />);
		expect(screen.getByText("1,1")).toBeTruthy();
		expect(screen.getByText("true true")).toBeTruthy();
		await act(async () => {
			fireEvent.click(screen.getByText("next"));
			await flush();
		});
		expect(screen.getByText("false true")).toBeTruthy();
		await backend.respondAll();
		await act(async () => {
			fireEvent.click(screen.getByText("previous"));
			await flush();
		});
		expect(screen.getByText("true false")).toBeTruthy();
		await backend.respondAll();
		expect(screen.getByText("0,0,1,1,2,2")).toBeTruthy();
		expect(settled).toHaveBeenCalledTimes(2);
	});

	it("leaves a disabled query pending in the browser", async () => {
		const backend = createBackend();
		const client = testClient();
		const handle = waterfallHandle(backend.disabledQuery, { id: 1 });
		const states: Array<boolean> = [];
		function Disabled() {
			const [, controls] = useQuery(backend.disabledQuery, handle);
			states.push(controls.isPending);
			return null;
		}
		await renderWith(client, <Disabled />);
		await act(flush);
		expect(backend.requests).toHaveLength(0);
		expect(states.every(Boolean)).toBe(true);
	});

	it("doesn't restart an entry that failed", async () => {
		const backend = createBackend();
		const client = testClient();
		const [handles] = await load(client, {
			issue: prefetchEntry(backend.issueQuery, { id: 9 }),
		});
		await backend.respondAll();
		function Issue() {
			const [, controls] = useQuery(backend.issueQuery, handles.issue);
			return <p>{String(controls.error !== undefined)}</p>;
		}
		await renderWith(client, <Issue />);
		expect(screen.getByText("true")).toBeTruthy();
		expect(backend.requests).toHaveLength(0);
	});

	describe("on the server", () => {
		it("hands a plain read of a disabled query to the browser", async () => {
			vi.spyOn(console, "error").mockImplementation(() => {});
			const backend = createBackend();
			const client = createQueryClient({ isServer: true });
			const handle = waterfallHandle(backend.disabledQuery, { id: 1 });
			const reads: Array<Promise<unknown>> = [];
			function Child(props: { readonly issue: Promise<unknown> }) {
				use(props.issue);
				return <p>loaded</p>;
			}
			function Disabled() {
				const [issue] = useQuery(backend.disabledQuery, handle);
				reads.push(issue);
				return (
					<Suspense fallback={<p>in the browser</p>}>
						<Child issue={issue} />
					</Suspense>
				);
			}
			const html = renderToString(
				<QueryClientProvider client={client}>
					<Disabled />
					<Disabled />
				</QueryClientProvider>,
			);

			expect(html).toContain("in the browser");
			expect(reads[1]).toBe(reads[0]);
			await expect(reads[0]).rejects.toThrow(QueryDisabledError);
			expect(backend.requests).toHaveLength(0);
		});

		it("throws for a defined read of a disabled query", () => {
			const backend = createBackend();
			const client = createQueryClient({ isServer: true });
			const handle = {
				...waterfallHandle(backend.disabledQuery, { id: 1 }),
				defined: true as const,
			};
			function Disabled() {
				useQuery(backend.disabledQuery, handle);
				return null;
			}
			expect(() =>
				renderToString(
					<QueryClientProvider client={client}>
						<Disabled />
					</QueryClientProvider>,
				),
			).toThrow(QueryDisabledError);
		});

		it("starts no request on a browser-only client", () => {
			const backend = createBackend();
			const client = createQueryClient({ isServer: true });
			client["~browserOnly"] = true;
			const handle = waterfallHandle(backend.issueQuery, { id: 1 });
			function Issue() {
				useQuery(backend.issueQuery, handle);
				return null;
			}
			expect(() =>
				renderToString(
					<QueryClientProvider client={client}>
						<Issue />
					</QueryClientProvider>,
				),
			).toThrow(/loads in the browser/u);
			expect(backend.requests).toHaveLength(0);
		});

		it("fetches on a server client without warning", () => {
			const backend = createBackend();
			const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
			const client = createQueryClient({ isServer: true });
			setData(
				client,
				backend.issueQuery,
				{ id: 2 },
				{ id: 2, title: "Cached" },
			);
			const handle = {
				input: { id: 1 },
				queryKey: backend.issueQuery({ id: 1 }).queryKey,
			};
			function Issue() {
				useQuery(backend.issueQuery, handle);
				return null;
			}
			renderToString(
				<QueryClientProvider client={client}>
					<Issue />
				</QueryClientProvider>,
			);
			expect(backend.requests).toHaveLength(1);
			expect(warn).not.toHaveBeenCalled();
		});
	});
});
