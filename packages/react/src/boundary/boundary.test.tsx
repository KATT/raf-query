import { describe, expect, expectTypeOf, it, vi } from "@effect/vitest";
import {
	act,
	cleanup,
	fireEvent,
	render,
	type RenderOptions,
	screen,
} from "@testing-library/react";
import { Cause, Context, Effect, Layer, Match, Result, Schema } from "effect";
import { type ReactNode, StrictMode, Suspense } from "react";

import {
	hydrate,
	QueryCache,
	QueryClient,
	QueryClientProvider,
	queryOptions,
} from "../index.ts";
import { Boundary } from "./index.ts";

class Unauthorized extends Schema.TaggedError<Unauthorized>()(
	"Unauthorized",
	{},
) {}

class Forbidden extends Schema.TaggedError<Forbidden>()("Forbidden", {
	id: Schema.Number,
}) {}

class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
	id: Schema.Number,
}) {}

interface Doc {
	readonly id: number;
	readonly title: string;
}

/** What `Docs.get` does; tests change it between reads. */
type Behavior = "die" | "forbidden" | "missing" | "ok" | "unauthorized";

class Docs extends Context.Service<
	Docs,
	{
		readonly get: (
			id: number,
		) => Effect.Effect<Doc, Forbidden | NotFound | Unauthorized>;
		readonly list: Effect.Effect<ReadonlyArray<Doc>, Unauthorized>;
	}
>()("test/Docs") {}

function docsLayer(state: { behavior: Behavior; calls: number }) {
	return Layer.succeed(Docs, {
		get: (id) =>
			Effect.suspend(
				(): Effect.Effect<Doc, Forbidden | NotFound | Unauthorized> => {
					state.calls++;
					switch (state.behavior) {
						case "ok":
							return Effect.succeed({ id, title: `Doc ${id}` });
						case "unauthorized":
							return Effect.fail(new Unauthorized());
						case "forbidden":
							return Effect.fail(new Forbidden({ id }));
						case "missing":
							return Effect.fail(new NotFound({ id }));
						case "die":
							return Effect.die(new Error(`doc ${id} exploded`));
					}
				},
			),
		list: Effect.suspend(() =>
			state.behavior === "unauthorized"
				? Effect.fail(new Unauthorized())
				: Effect.succeed([{ id: 1, title: "Doc 1" }]),
		),
	});
}

const getDoc = (id: number) =>
	Effect.flatMap(Effect.service(Docs), (docs) => docs.get(id));

const listDocs = Effect.flatMap(Effect.service(Docs), (docs) => docs.list);

function docQuery(input: { id: number }) {
	return queryOptions({
		queryFn: () => getDoc(input.id),
		queryKey: ["doc", input.id],
		retry: false,
	});
}

function docListQuery() {
	return queryOptions({
		queryFn: () => listDocs,
		queryKey: ["docs"],
		retry: false,
	});
}

function setup(initial: Behavior) {
	const state = { behavior: initial, calls: 0 };
	const client = new QueryClient({ isServer: false, layer: docsLayer(state) });
	const [App, useApp] = Boundary.root({
		client,
		fallback: (props) => (
			<button onClick={props.retry} type="button">
				crashed: {Cause.pretty(props.cause).split("\n")[0]}
			</button>
		),
		name: "App",
	});
	const [Auth, useAuth] = Boundary.catchErrors(App, {
		errors: [Unauthorized],
		fallback: (props) => (
			<button onClick={props.retry} type="button">
				sign in
			</button>
		),
		name: "Auth",
	});
	const [DocAccess, useDocAccess] = Boundary.catchErrors(Auth, {
		errors: [Forbidden],
		fallback: (props) => <p>forbidden {props.error.id}</p>,
		name: "DocAccess",
	});
	const doc = client.prefetch(docQuery, { id: 1 });
	const list = client.prefetch(docListQuery);
	function view(children: ReactNode) {
		return (
			<Suspense fallback={<p>loading</p>}>
				<App>
					<Auth>
						<DocAccess>{children}</DocAccess>
					</Auth>
				</App>
			</Suspense>
		);
	}
	return {
		App,
		Auth,
		client,
		doc,
		DocAccess,
		list,
		state,
		useApp,
		useAuth,
		useDocAccess,
		view,
	};
}

function settle() {
	return act(
		() =>
			new Promise((resolve) => {
				setTimeout(resolve, 0);
			}),
	);
}

/** Renders `node` and lets its queries settle; disposing unmounts it. */
async function mount(
	node: ReactNode,
	options?: Pick<RenderOptions, "onCaughtError">,
): Promise<Disposable> {
	// React logs every error a boundary catches.
	const errors = vi.spyOn(console, "error").mockImplementation(() => {});
	await act(async () => render(node, options));
	await settle();
	return {
		[Symbol.dispose]: () => {
			cleanup();
			errors.mockRestore();
		},
	};
}

describe("Boundary", () => {
	it("renders the data once the query loads", async () => {
		const test = setup("ok");
		function Title() {
			const doc = test.DocAccess.useResult(docQuery, test.doc);
			return <p>{Result.getOrThrow(doc).title}</p>;
		}
		function List() {
			const docs = test.useAuth(docListQuery, test.list);
			return <p>{docs.length} docs</p>;
		}
		using _view = await mount(
			test.view(
				<>
					<Title />
					<List />
				</>,
			),
		);
		expect(screen.getByText("Doc 1")).toBeDefined();
		expect(screen.getByText("1 docs")).toBeDefined();
	});

	it("sends a typed failure to the boundary that catches it", async () => {
		const test = setup("unauthorized");
		function Title() {
			const doc = test.DocAccess.useResult(docQuery, test.doc);
			return <p>{Result.getOrThrow(doc).title}</p>;
		}
		using _view = await mount(test.view(<Title />));
		expect(screen.getByText("sign in")).toBeDefined();
	});

	it("hands back the failures nothing in the chain catches", async () => {
		const test = setup("missing");
		function Title() {
			const doc = test.DocAccess.useResult(docQuery, test.doc);
			return Result.match(doc, {
				onFailure: (error) =>
					Match.valueTags(error, {
						NotFound: (missing) => <p>no doc {missing.id}</p>,
					}),
				onSuccess: (found) => <p>{found.title}</p>,
			});
		}
		using _view = await mount(test.view(<Title />));
		expect(screen.getByText("no doc 1")).toBeDefined();
	});

	it("routes by the chain a component reads through, not by what is rendered around it", async () => {
		const test = setup("forbidden");
		function Title() {
			const doc = test.Auth.useResult(docQuery, test.doc);
			return Result.match(doc, {
				onFailure: (error) => <p>inline {error._tag}</p>,
				onSuccess: (found) => <p>{found.title}</p>,
			});
		}
		using _view = await mount(test.view(<Title />));
		expect(screen.getByText("inline Forbidden")).toBeDefined();
	});

	it("tells onCaughtError which boundary caught what, once", async () => {
		const test = setup("forbidden");
		const caught: Array<string> = [];
		const onCaughtError: RenderOptions["onCaughtError"] = (error) => {
			const by = Boundary.caughtBy(error);
			caught.push(
				by === undefined
					? "other"
					: `${by.boundary.displayName}: ${Schema.is(Forbidden)(by.error) ? by.error._tag : "?"}`,
			);
		};
		function Title() {
			const doc = test.DocAccess.useResult(docQuery, test.doc);
			return <p>{Result.getOrThrow(doc).title}</p>;
		}
		using _view = await mount(<StrictMode>{test.view(<Title />)}</StrictMode>, {
			onCaughtError,
		});
		expect(screen.getByText("forbidden 1")).toBeDefined();
		expect(caught).toEqual(["DocAccess: Forbidden"]);
	});

	it("sends defects to the root, past every typed boundary", async () => {
		const test = setup("die");
		function Title() {
			const doc = test.DocAccess.useResult(docQuery, test.doc);
			return <p>{Result.getOrThrow(doc).title}</p>;
		}
		using _view = await mount(test.view(<Title />));
		expect(screen.getByText(/crashed: Error: doc 1 exploded/)).toBeDefined();
	});

	it("sends a failure hydrated from a server to the root: it has no Cause to route by", async () => {
		const test = setup("ok");
		const failed = Promise.reject(new Forbidden({ id: 3 }));
		hydrate(test.client, {
			queries: [
				{ effect: true, key: ["doc", 3], promise: failed, updatedAt: 0 },
			],
		});
		const handle = test.client.prefetch(docQuery, { id: 3 });
		function Title() {
			const doc = test.DocAccess.useResult(docQuery, handle);
			return <p>{Result.getOrThrow(doc).title}</p>;
		}
		using _view = await mount(test.view(<Title />));
		expect(screen.getByText(/crashed: Forbidden/)).toBeDefined();
		expect(screen.queryByText("forbidden 3")).toBeNull();
	});

	it("sends a failure the types said was caught, and wasn't, to the root", async () => {
		const test = setup("missing");
		// SAFETY: a test of the runtime when the types are wrong.
		const useEverything = test.useAuth as unknown as Boundary.UseBoundary<
			Forbidden | NotFound | Unauthorized
		>;
		function Title() {
			const doc = useEverything(docQuery, test.doc);
			return <p>{doc.title}</p>;
		}
		using _view = await mount(test.view(<Title />));
		expect(screen.getByText(/crashed: NotFound/)).toBeDefined();
	});

	it("retry renders the children again, which refetches what failed", async () => {
		const test = setup("unauthorized");
		function Title() {
			const doc = test.DocAccess.useResult(docQuery, test.doc);
			return <p>{Result.getOrThrow(doc).title}</p>;
		}
		using _view = await mount(test.view(<Title />));
		expect(test.state.calls).toBe(1);
		test.state.behavior = "ok";
		await act(async () => fireEvent.click(screen.getByText("sign in")));
		await settle();
		expect(screen.getByText("Doc 1")).toBeDefined();
		expect(test.state.calls).toBe(2);
	});

	it("root's retry refetches a defect's query", async () => {
		const test = setup("die");
		function Title() {
			const doc = test.DocAccess.useResult(docQuery, test.doc);
			return <p>{Result.getOrThrow(doc).title}</p>;
		}
		using _view = await mount(test.view(<Title />));
		test.state.behavior = "ok";
		await act(async () => fireEvent.click(screen.getByText(/crashed/)));
		await settle();
		expect(screen.getByText("Doc 1")).toBeDefined();
	});

	it("a hook throws without its boundary above it", async () => {
		const test = setup("ok");
		function Title() {
			const doc = test.DocAccess.useResult(docQuery, test.doc);
			return <p>{Result.getOrThrow(doc).title}</p>;
		}
		using _view = await mount(
			<Suspense fallback={null}>
				<test.App>
					<test.Auth>
						<Title />
					</test.Auth>
				</test.App>
			</Suspense>,
		);
		expect(
			screen.getByText(/its hook needs <DocAccess> above it/),
		).toBeDefined();
	});

	it("a boundary throws without its parent above it", async () => {
		const test = setup("ok");
		using _view = await mount(
			<Suspense fallback={null}>
				<test.App>
					<test.DocAccess>
						<p>never</p>
					</test.DocAccess>
				</test.App>
			</Suspense>,
		);
		expect(screen.getByText(/<DocAccess> needs <Auth> above it/)).toBeDefined();
	});

	it("a root without a client needs a QueryClientProvider", async () => {
		const [App] = Boundary.root({
			fallback: (props) => <p>crashed: {String(Cause.squash(props.cause))}</p>,
			name: "App",
		});
		using _view = await mount(
			<App>
				<p>never</p>
			</App>,
		);
		expect(
			screen.getByText(/<App> needs a QueryClientProvider above it/),
		).toBeDefined();
	});

	it("a root without a client reads the provider's", async () => {
		const state = { behavior: "ok", calls: 0 } satisfies {
			behavior: Behavior;
			calls: number;
		};
		const client = new QueryClient({
			isServer: false,
			layer: docsLayer(state),
		});
		const [App] = Boundary.root<Docs>({
			fallback: () => <p>crashed</p>,
			name: "App",
		});
		const handle = client.prefetch(docQuery, { id: 2 });
		function Title() {
			const doc = App.useResult(docQuery, handle);
			return <p>{Result.getOrThrow(doc).title}</p>;
		}
		using _view = await mount(
			<QueryClientProvider client={client}>
				<Suspense fallback={null}>
					<App>
						<Title />
					</App>
				</Suspense>
			</QueryClientProvider>,
		);
		expect(screen.getByText("Doc 2")).toBeDefined();
	});

	it("useRun hands back uncaught failures and sends caught ones to their boundary", async () => {
		const test = setup("missing");
		const results: Array<string> = [];
		function Rename() {
			const run = test.DocAccess.useRun();
			return (
				<button
					onClick={async () => {
						const result = await run.result(getDoc(1));
						results.push(Result.isFailure(result) ? result.failure._tag : "ok");
					}}
					type="button"
				>
					rename
				</button>
			);
		}
		using _view = await mount(test.view(<Rename />));
		await act(async () => fireEvent.click(screen.getByText("rename")));
		await settle();
		expect(results).toEqual(["NotFound"]);

		test.state.behavior = "unauthorized";
		await act(async () => fireEvent.click(screen.getByText("rename")));
		await settle();
		expect(screen.getByText("sign in")).toBeDefined();
		expect(results).toEqual(["NotFound"]);
	});

	it("useRun resolves with the data when nothing is left, and runs with the cache", async () => {
		const test = setup("ok");
		const results: Array<number> = [];
		const refresh = Effect.gen(function* () {
			const cache = yield* QueryCache.QueryCache;
			const fetched = yield* cache.fetch(docListQuery);
			return fetched.data;
		}).pipe(Effect.catchTag("CancelledError", () => Effect.succeed([])));
		function Refresh() {
			const run = test.Auth.useRun();
			return (
				<button
					onClick={async () => {
						const docs = await run(refresh);
						results.push(docs.length);
					}}
					type="button"
				>
					refresh
				</button>
			);
		}
		using _view = await mount(test.view(<Refresh />));
		await act(async () => fireEvent.click(screen.getByText("refresh")));
		await settle();
		expect(results).toEqual([1]);
	});
});

// Type tests: the hooks are only called inside functions that never run.
describe("Boundary types", () => {
	const test = setup("ok");
	const handle = test.doc;
	const listHandle = test.list;

	it("narrows what is left by the chain read through", () => {
		expectTypeOf(() =>
			test.DocAccess.useResult(docQuery, handle),
		).returns.toEqualTypeOf<Result.Result<Doc, NotFound>>();
		expectTypeOf(() =>
			test.Auth.useResult(docQuery, handle),
		).returns.toEqualTypeOf<Result.Result<Doc, Forbidden | NotFound>>();
		expectTypeOf(() =>
			test.App.useResult(docQuery, handle),
		).returns.toEqualTypeOf<
			Result.Result<Doc, Forbidden | NotFound | Unauthorized>
		>();
		expectTypeOf<Boundary.HandledBy<typeof test.DocAccess>>().toEqualTypeOf<
			Forbidden | Unauthorized
		>();
	});

	it("returns the data only when nothing is left", () => {
		expectTypeOf(() =>
			test.useAuth(docListQuery, listHandle),
		).returns.toEqualTypeOf<ReadonlyArray<Doc>>();
		expectTypeOf(() =>
			test.Auth.useResult(docListQuery, listHandle),
		).returns.toEqualTypeOf<Result.Result<ReadonlyArray<Doc>, never>>();
		expectTypeOf(() =>
			// @ts-expect-error -- NotFound is left
			test.useDocAccess(docQuery, handle),
		).toBeFunction();
		expectTypeOf(() =>
			// @ts-expect-error -- Unauthorized is left
			test.useApp(docListQuery, listHandle),
		).toBeFunction();
	});

	it("rejects a boundary that catches what one above it catches", () => {
		expectTypeOf(() =>
			Boundary.catchErrors(test.DocAccess, {
				// @ts-expect-error -- Auth catches Unauthorized
				errors: [Unauthorized],
				fallback: () => null,
				name: "Again",
			}),
		).toBeFunction();
	});

	it("narrows useRun the same way", () => {
		const get = getDoc(1);
		const list = listDocs;
		expectTypeOf(() =>
			test.DocAccess.useRun().result(get),
		).returns.toEqualTypeOf<Promise<Result.Result<Doc, NotFound>>>();
		expectTypeOf(() => test.DocAccess.useRun()(list)).returns.toEqualTypeOf<
			Promise<ReadonlyArray<Doc>>
		>();
		expectTypeOf(() =>
			// @ts-expect-error -- NotFound is left
			test.DocAccess.useRun()(get),
		).toBeFunction();
	});

	it("only runs Effects whose services the root provides", () => {
		class Analytics extends Context.Service<Analytics, number>()(
			"test/Analytics",
		) {}
		expectTypeOf(() =>
			// @ts-expect-error -- the client's layer doesn't provide Analytics
			test.DocAccess.useRun()(Effect.service(Analytics)),
		).toBeFunction();
	});
});
