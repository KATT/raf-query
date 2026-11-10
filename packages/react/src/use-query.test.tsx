import { act, fireEvent, screen } from "@testing-library/react";
import { Suspense, use, useState } from "react";
import { renderToReadableStream } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
	createQueryClient,
	invalidateOne,
	load,
	prefetch,
	QueryClientProvider,
	queryOptions,
	type QueryState,
	type QueryHandle,
	removeOne,
	revalidate,
	setData,
	type Thenable,
	swr,
	useQuery,
	waterfallHandle,
} from "./index.ts";
import { HydrationBoundary as ServerHydrationBoundary } from "./index-react-server.ts";
import {
	createBackend,
	flush,
	type Issue,
	renderWith,
	testClient,
} from "./test-utils.tsx";

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
	it("reads a loaded handle without suspending, and suspends again once the cache dropped it", async () => {
		const backend = createBackend();
		const client = testClient();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		let handle!: QueryHandle<Backend["issueQuery"]>;
		await loaded(backend, async () => {
			[{ issue: handle }] = await load(client, {
				issue: revalidate(backend.issueQuery, { id: 1 }),
			});
		});
		function Issue() {
			const [issueThenable, controls] = useQuery(backend.issueQuery, handle);
			const issue = use(issueThenable);
			return (
				<p>
					{issue.title} {controls.hash} {String(controls.isPending)}
				</p>
			);
		}
		const view = await renderWith(client, <Issue />);
		expect(screen.getByText(/First/u).textContent).toContain("false");
		expect(screen.queryByText("loading")).toBeNull();

		view.unmount();
		await act(() => removeOne(client, backend.issueQuery, { id: 1 }));
		await renderWith(client, <Issue />);
		expect(screen.getByText("loading")).toBeTruthy();
		expect(warn).toHaveBeenCalledOnce();
		await backend.respondAll();
		expect(screen.getByText(/First/u)).toBeTruthy();
	});

	it("keeps a loaded handle while waterfallHandle's updater returns the same input", async () => {
		const backend = createBackend();
		const client = testClient();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		let handle!: QueryHandle<Backend["issueQuery"]>;
		await loaded(backend, async () => {
			[{ issue: handle }] = await load(client, {
				issue: revalidate(backend.issueQuery, { id: 1 }),
			});
		});
		const read: Array<QueryHandle<Backend["issueQuery"]>> = [];
		function Issue() {
			const [id, setId] = useState(handle.input.id);
			const issueHandle = waterfallHandle(
				backend.issueQuery,
				handle,
				(input) => ({ ...input, id }),
			);
			read.push(issueHandle);
			const [issueThenable] = useQuery(backend.issueQuery, issueHandle, {
				whilePending: "previous",
			});
			const issue = use(issueThenable);
			return (
				<button onClick={() => setId(2)} type="button">
					{issue.title}
				</button>
			);
		}
		await renderWith(client, <Issue />);
		expect(read.length).toBeGreaterThan(0);
		expect(read.every((each) => each === handle)).toBe(true);
		expect(backend.requests).toHaveLength(0);

		fireEvent.click(screen.getByText("First"));
		expect(read.at(-1)?.input).toEqual({ id: 2 });
		expect(backend.requests).toHaveLength(1);
		await backend.respondAll();
		expect(screen.getByText("Second")).toBeTruthy();
		expect(warn).not.toHaveBeenCalled();
	});

	it("reads without suspending by switching on the thenable's status", async () => {
		const backend = createBackend();
		const client = testClient();
		const [handles] = await load(client, {
			found: prefetch(backend.issueQuery, { id: 1 }),
			missing: prefetch(backend.issueQuery, { id: 9 }),
		});
		function Issue(props: {
			readonly handle: QueryHandle<Backend["issueQuery"]>;
		}) {
			const [issueThenable] = useQuery(backend.issueQuery, props.handle);
			switch (issueThenable.status) {
				case "pending":
					return <p>pending</p>;
				case "rejected":
					return <p>failed {String(issueThenable.reason)}</p>;
				case "fulfilled":
					return <p>{issueThenable.value.title}</p>;
			}
		}
		await renderWith(
			client,
			<>
				<Issue handle={handles.found} />
				<Issue handle={handles.missing} />
			</>,
		);
		expect(screen.getAllByText("pending")).toHaveLength(2);
		expect(screen.queryByText("loading")).toBeNull();
		await backend.respondAll();
		expect(screen.getByText("First")).toBeTruthy();
		expect(screen.getByText(/^failed /u)).toBeTruthy();
	});

	it("returns a thenable for a prefetch handle", async () => {
		const backend = createBackend();
		const client = testClient();
		const [handles] = await load(client, {
			issue: prefetch(backend.issueQuery, { id: 2 }),
		});
		function Issue() {
			const [issueThenable] = useQuery(backend.issueQuery, handles.issue);
			const issue = use(issueThenable);
			return <IssueTitle issue={issue} />;
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
			const [issueThenable] = useQuery(backend.issueQuery, handle);
			const issue = use(issueThenable);
			return <IssueTitle issue={issue} />;
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
		const handle: QueryHandle<Backend["issueQuery"]> = {
			input: { id: 1 },
			queryKey: backend.issueQuery({ id: 1 }).queryKey,
		};
		function Issue() {
			const [issueThenable] = useQuery(backend.issueQuery, handle);
			const issue = use(issueThenable);
			return <IssueTitle issue={issue} />;
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
		let handles!: { readonly title: QueryHandle<Backend["titleQuery"]> };
		await loaded(backend, async () => {
			[handles] = await load(client, {
				title: swr(backend.titleQuery, { id: 1 }),
			});
		});
		function Title() {
			const [titleThenable] = useQuery(backend.titleQuery, handles.title);
			const title = use(titleThenable);
			return <p>{title}</p>;
		}
		await renderWith(client, <Title />);
		expect(screen.getByText("FIRST")).toBeTruthy();
	});

	it("reads a refetched, invalidated entry when it mounts", async () => {
		const backend = createBackend();
		const client = testClient();
		let handles!: { readonly issue: QueryHandle<Backend["issueQuery"]> };
		await loaded(backend, async () => {
			[handles] = await load(client, {
				issue: revalidate(backend.issueQuery, { id: 1 }),
			});
		});
		void invalidateOne(client, backend.issueQuery, { id: 1 });
		function Issue() {
			const [issueThenable, controls] = useQuery(
				backend.issueQuery,
				handles.issue,
			);
			const issue = use(issueThenable);
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
		let handles!: { readonly issue: QueryHandle<Backend["issueQuery"]> };
		await loaded(backend, async () => {
			[handles] = await load(client, {
				issue: revalidate(backend.issueQuery, { id: 1 }),
			});
		});
		const settled = vi.fn();
		function Issue() {
			const [issueThenable, controls] = useQuery(
				backend.issueQuery,
				handles.issue,
			);
			const issue = use(issueThenable);
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

	describe("tracked state", () => {
		it("keeps the state object until a field the component read changes, and its functions for good", async () => {
			const backend = createBackend();
			const client = testClient();
			let handles!: { readonly issue: QueryHandle<Backend["issueQuery"]> };
			await loaded(backend, async () => {
				[handles] = await load(client, {
					issue: revalidate(backend.issueQuery, { id: 1 }),
				});
			});
			const thenables: Array<Thenable<Issue>> = [];
			const states: Array<QueryState<Backend["issueQuery"]>> = [];
			function Issue(props: { readonly label: string }) {
				const [issueThenable, controls] = useQuery(
					backend.issueQuery,
					handles.issue,
				);
				thenables.push(issueThenable);
				states.push(controls);
				const issue = use(issueThenable);
				return (
					<button onClick={() => void controls.refetch()} type="button">
						{props.label} {issue.title} {String(controls.isFetching)}
					</button>
				);
			}
			const view = await renderWith(client, <Issue label="a" />);
			await view.rerender(<Issue label="b" />);
			expect(states[1]).toBe(states[0]);

			await act(async () => {
				fireEvent.click(screen.getByText("b First false"));
				await flush();
			});
			expect(screen.getByText("b First true")).toBeTruthy();
			await backend.respondAll();
			expect(screen.getByText("b First false")).toBeTruthy();
			expect(states).toHaveLength(4);
			expect(new Set(states).size).toBe(3);
			expect(new Set(states.map((state) => state.refetch)).size).toBe(1);
			expect(new Set(thenables).size).toBe(1);

			backend.store.set(1, { id: 1, title: "Again" });
			const refetching = states[0]?.refetch();
			await backend.respondAll();
			await refetching;
			expect(screen.getByText("b Again false")).toBeTruthy();
			expect(new Set(thenables).size).toBe(2);
		});

		it("re-renders a component that reads no field when its thenable settles", async () => {
			const backend = createBackend();
			const client = testClient();
			const [handles] = await load(client, {
				issue: prefetch(backend.issueQuery, { id: 1 }),
			});
			function Issue() {
				const [issueThenable] = useQuery(backend.issueQuery, handles.issue);
				return (
					<p>
						{issueThenable.status === "fulfilled"
							? issueThenable.value.title
							: "waiting"}
					</p>
				);
			}
			await renderWith(client, <Issue />);
			expect(screen.getByText("waiting")).toBeTruthy();
			await backend.respondAll();
			expect(screen.getByText("First")).toBeTruthy();
		});
	});

	it("keeps the previous data with whilePending: previous", async () => {
		const backend = createBackend();
		const client = testClient();
		setData(client, backend.issueQuery, { id: 1 }, { id: 1, title: "First" });
		function Issue(props: { readonly id: number }) {
			const [issueThenable, controls] = useQuery(
				backend.issueQuery,
				waterfallHandle(backend.issueQuery, { id: props.id }),
				{ whilePending: "previous" },
			);
			const issue = use(issueThenable);
			return (
				<p>
					{issue.title} {String(controls.isPrevious)}
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

	it("doesn't restart an entry that failed", async () => {
		const backend = createBackend();
		const client = testClient();
		const [handles] = await load(client, {
			issue: prefetch(backend.issueQuery, { id: 9 }),
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
		/** What a read left to the browser rejects with. */
		const bailoutError = {
			digest: "BAILOUT_TO_CLIENT_SIDE_RENDERING",
			name: "BrowserRenderError",
		} satisfies Pick<Error, "name"> & { readonly digest: string };

		it("fetches a query nothing started while rendering, without a warning", async () => {
			const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
			const backend = createBackend();
			const client = createQueryClient({ isServer: true });
			const handle = waterfallHandle(backend.issueQuery, { id: 1 });
			function Issue() {
				const [issueThenable] = useQuery(backend.issueQuery, handle);
				const issue = use(issueThenable);
				return <p>{issue.title}</p>;
			}
			const rendering = renderToReadableStream(
				<QueryClientProvider client={client}>
					<Suspense fallback={<p>loading</p>}>
						<Issue />
					</Suspense>
				</QueryClientProvider>,
			);
			await vi.waitFor(() => expect(backend.requests).toHaveLength(1));
			await backend.respondAll();
			const stream = await rendering;
			await stream.allReady;
			const html = await new Response(stream).text();

			expect(html).toContain("First");
			expect(warn).not.toHaveBeenCalled();
		});

		it("under a server components' HydrationBoundary, leaves a query nothing sent to the browser", async () => {
			const errors: Array<unknown> = [];
			const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
			const backend = createBackend();
			const client = createQueryClient({ isServer: true });
			const serverComponents = createQueryClient({ isServer: true });
			const handle = waterfallHandle(backend.issueQuery, { id: 1 });
			const unstarted: QueryHandle<Backend["issueQuery"]> = {
				input: { id: 2 },
				queryKey: backend.issueQuery({ id: 2 }).queryKey,
			};
			function Issue(props: {
				readonly handle: QueryHandle<Backend["issueQuery"]>;
			}) {
				const [issueThenable] = useQuery(backend.issueQuery, props.handle);
				const issue = use(issueThenable);
				return <p>{issue.title}</p>;
			}
			const reads: Array<Promise<unknown>> = [];
			function ReadsTwice() {
				reads.push(
					useQuery(backend.issueQuery, unstarted)[0],
					useQuery(backend.issueQuery, unstarted)[0],
				);
				return null;
			}
			const stream = await renderToReadableStream(
				<QueryClientProvider client={client}>
					<ServerHydrationBoundary client={serverComponents}>
						<Suspense fallback={<p>in the browser</p>}>
							<Issue handle={handle} />
						</Suspense>
						<Suspense fallback={<p>also in the browser</p>}>
							<Issue handle={unstarted} />
						</Suspense>
						<ReadsTwice />
					</ServerHydrationBoundary>
				</QueryClientProvider>,
				{ onError: (error) => void errors.push(error) },
			);
			await stream.allReady;
			const html = await new Response(stream).text();

			expect(html).toContain("in the browser");
			expect(html).toContain("also in the browser");
			expect(errors).toEqual([
				expect.objectContaining(bailoutError),
				expect.objectContaining(bailoutError),
			]);
			expect(reads[1]).toBe(reads[0]);
			expect(backend.requests).toHaveLength(0);
			expect(warn).not.toHaveBeenCalled();
		});

		it("leaves an ssr: false query to the browser, without running it", async () => {
			const errors: Array<unknown> = [];
			let calls = 0;
			const pushState = (input: { readonly slug: string }) =>
				queryOptions({
					queryFn: async () => {
						calls += 1;
						return "on";
					},
					queryKey: ["pushState", input.slug],
					ssr: false,
				});
			const client = createQueryClient({ isServer: true });
			const [handles] = await load(client, {
				push: prefetch(pushState, { slug: "hello" }),
			});
			const statuses: Array<string> = [];
			function Push() {
				const [pushThenable] = useQuery(pushState, handles.push);
				return <p>push {use(pushThenable)}</p>;
			}
			function PushStatus() {
				const [pushThenable, state] = useQuery(pushState, handles.push);
				statuses.push(`${pushThenable.status} ${String(state.isPending)}`);
				return null;
			}
			const stream = await renderToReadableStream(
				<QueryClientProvider client={client}>
					<Suspense fallback={<p>in the browser</p>}>
						<Push />
					</Suspense>
					<PushStatus />
				</QueryClientProvider>,
				{ onError: (error) => void errors.push(error) },
			);
			await stream.allReady;
			const html = await new Response(stream).text();

			// `use()` renders the boundary's fallback instead of holding the
			// response open; a reader of the status renders "not loaded yet".
			expect(html).toContain("in the browser");
			expect(errors).toEqual([expect.objectContaining(bailoutError)]);
			expect(statuses).toEqual(["rejected true"]);
			expect(calls).toBe(0);
		});

		it("starts an ssr: false query when the browser reads it, without a warning", async () => {
			const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
			const pushState = (input: { readonly slug: string }) =>
				queryOptions({
					queryFn: async () => "on",
					queryKey: ["pushState", input.slug],
					ssr: false,
				});
			// The handle a server loader sent: a plain object after serialization.
			const sent: QueryHandle<typeof pushState> = {
				input: { slug: "hello" },
				queryKey: ["pushState", "hello"],
			};
			function Push() {
				const [pushThenable] = useQuery(pushState, sent);
				return <p>push {use(pushThenable)}</p>;
			}
			await renderWith(testClient(), <Push />);

			expect(await screen.findByText("push on")).toBeTruthy();
			expect(warn).not.toHaveBeenCalled();
		});

		it("renders a request a loader started, and data already cached", async () => {
			const backend = createBackend();
			const client = createQueryClient({ isServer: true });
			setData(
				client,
				backend.issueQuery,
				{ id: 2 },
				{ id: 2, title: "Cached" },
			);
			const [handles] = await load(client, {
				one: prefetch(backend.issueQuery, { id: 1 }),
			});
			const cached = waterfallHandle(backend.issueQuery, { id: 2 });
			function Issue(props: {
				readonly handle: QueryHandle<Backend["issueQuery"]>;
			}) {
				const [issueThenable] = useQuery(backend.issueQuery, props.handle);
				const issue = use(issueThenable);
				return <p>{issue.title}</p>;
			}
			const rendering = renderToReadableStream(
				<QueryClientProvider client={client}>
					<Suspense fallback={<p>loading</p>}>
						<Issue handle={handles.one} />
						<Issue handle={cached} />
					</Suspense>
				</QueryClientProvider>,
			);
			await backend.respondAll();
			const stream = await rendering;
			await stream.allReady;
			const html = await new Response(stream).text();

			expect(html).toContain("First");
			expect(html).toContain("Cached");
			expect(backend.requests).toHaveLength(0);
		});
	});
});
