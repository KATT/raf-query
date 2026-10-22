import { describe, expect, expectTypeOf, it, vi } from "@effect/vitest";
import {
	act,
	cleanup,
	fireEvent,
	render,
	type RenderOptions,
	screen,
} from "@testing-library/react";
import { Cause, Context, Data, Effect, Layer, Schema } from "effect";
import { Rpc, type RpcClientError, RpcGroup, RpcMiddleware } from "effect/rpc";
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

// Tags need no schema: any `{ readonly _tag: "…" }` type can be caught.
class NotFound extends Data.TaggedError("NotFound")<{ readonly id: number }> {}

type AppError = Forbidden | NotFound | Unauthorized;

interface Doc {
	readonly id: number;
	readonly title: string;
}

/** What `Docs.get` does; tests change it between reads. */
type Behavior =
	| "die"
	| "forbidden"
	| "forbidden-object"
	| "missing"
	| "ok"
	| "unauthorized";

class Docs extends Context.Service<
	Docs,
	{
		readonly get: (id: number) => Effect.Effect<Doc, AppError>;
		readonly list: Effect.Effect<ReadonlyArray<Doc>, Unauthorized>;
	}
>()("test/Docs") {}

function docsLayer(state: { behavior: Behavior; calls: number }) {
	return Layer.succeed(Docs, {
		get: (id) =>
			Effect.suspend((): Effect.Effect<Doc, AppError> => {
				state.calls++;
				switch (state.behavior) {
					case "ok":
						return Effect.succeed({ id, title: `Doc ${id}` });
					case "unauthorized":
						return Effect.fail(new Unauthorized());
					case "forbidden":
						return Effect.fail(new Forbidden({ id }));
					case "forbidden-object": {
						// SAFETY: a test of what tag matching trusts: a value that only claims the type.
						// oxlint-disable-next-line anti-slop-effect/no-manual-tagged-construction -- the point of the test
						const claimed = { _tag: "Forbidden", id } as Forbidden;
						return Effect.fail(claimed);
					}
					case "missing":
						return Effect.fail(new NotFound({ id }));
					case "die":
						return Effect.die(new Error(`doc ${id} exploded`));
				}
			}),
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

/** A `queryFn` that returns a promise: its error is `unknown`. */
function plainQuery(input: { reason: unknown }) {
	return queryOptions({
		queryFn: () =>
			input.reason === undefined
				? Promise.resolve("plain")
				: Promise.reject(input.reason),
		queryKey: ["plain", String(input.reason)],
		retry: false,
	});
}

function setup(initial: Behavior) {
	const state = { behavior: initial, calls: 0 };
	const client = new QueryClient({ isServer: false, layer: docsLayer(state) });
	const [App, useApp] = Boundary.root({
		client,
		errors: Boundary.errors<AppError>(),
		fallback: (props) => (
			<button onClick={props.retry} type="button">
				crashed: {Cause.pretty(props.cause).split("\n")[0]}
			</button>
		),
		name: "App",
	});
	const [Auth, useAuth] = Boundary.catchErrors(App, {
		fallback: (props) => (
			<button onClick={props.retry} type="button">
				sign in
			</button>
		),
		name: "Auth",
		tags: ["Unauthorized"],
	});
	const [DocAccess, useDocAccess] = Boundary.catchErrors(Auth, {
		fallback: (props) => <p>forbidden {props.error.id}</p>,
		name: "DocAccess",
		tags: ["Forbidden"],
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

type Test = ReturnType<typeof setup>;

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

/** Reads doc 1 through DocAccess; a NotFound comes back inline. */
function titleOf(test: Test) {
	return function Title() {
		const doc = test.useDocAccess(docQuery, test.doc);
		return Boundary.isUnhandled(doc) ? (
			<p>no doc {doc.error.id}</p>
		) : (
			<p>{doc.title}</p>
		);
	};
}

describe("Boundary", () => {
	it("renders the data once the query loads", async () => {
		const test = setup("ok");
		const Title = titleOf(test);
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

	it("sends a typed failure to the boundary that lists its tag", async () => {
		const test = setup("unauthorized");
		const Title = titleOf(test);
		using _view = await mount(test.view(<Title />));
		expect(screen.getByText("sign in")).toBeDefined();
	});

	it("hands back the failures nothing in the chain catches, as an Unhandled", async () => {
		const test = setup("missing");
		const Title = titleOf(test);
		using _view = await mount(test.view(<Title />));
		expect(screen.getByText("no doc 1")).toBeDefined();
	});

	it("hands back the same Unhandled on every render", async () => {
		const test = setup("missing");
		const seen = new Set<unknown>();
		function Title() {
			const doc = test.useDocAccess(docQuery, test.doc);
			seen.add(doc);
			return <p>{Boundary.isUnhandled(doc) ? "missing" : doc.title}</p>;
		}
		using _view = await mount(<StrictMode>{test.view(<Title />)}</StrictMode>);
		expect(screen.getByText("missing")).toBeDefined();
		expect(seen.size).toBe(1);
	});

	it("routes by the chain a component reads through, not by what is rendered around it", async () => {
		const test = setup("forbidden");
		function Title() {
			const doc = test.useAuth(docQuery, test.doc);
			return (
				<p>{Boundary.isUnhandled(doc) ? `inline ${doc.error._tag}` : "ok"}</p>
			);
		}
		using _view = await mount(test.view(<Title />));
		expect(screen.getByText("inline Forbidden")).toBeDefined();
	});

	it("matches by tag alone: it trusts the typed failure channel", async () => {
		const test = setup("forbidden-object");
		const Title = titleOf(test);
		using _view = await mount(test.view(<Title />));
		expect(screen.getByText("forbidden 1")).toBeDefined();
	});

	it("tells onCaughtError which boundary caught what, once", async () => {
		const test = setup("forbidden");
		const caught: Array<string> = [];
		const onCaughtError: RenderOptions["onCaughtError"] = (error) => {
			const by = Boundary.caughtBy(error);
			caught.push(
				by === undefined
					? "other"
					: `${by.boundary.displayName}: ${Schema.is(Forbidden)(by.error) ? "Forbidden" : "?"}`,
			);
		};
		const Title = titleOf(test);
		using _view = await mount(<StrictMode>{test.view(<Title />)}</StrictMode>, {
			onCaughtError,
		});
		expect(screen.getByText("forbidden 1")).toBeDefined();
		expect(caught).toEqual(["DocAccess: Forbidden"]);
	});

	it("sends defects to the root, past every typed boundary", async () => {
		const test = setup("die");
		const Title = titleOf(test);
		using _view = await mount(test.view(<Title />));
		expect(screen.getByText(/crashed: Error: doc 1 exploded/)).toBeDefined();
	});

	it("sends a promise queryFn's failure to the root, even one with a tag a boundary lists", async () => {
		const test = setup("ok");
		const tagged = test.client.prefetch(plainQuery, {
			// oxlint-disable-next-line anti-slop-effect/no-manual-tagged-construction -- a rejection that only looks tagged
			reason: { _tag: "Unauthorized" },
		});
		function Plain() {
			const value = test.useDocAccess(plainQuery, tagged);
			return <p>{value}</p>;
		}
		using _view = await mount(test.view(<Plain />));
		expect(screen.getByText(/crashed/)).toBeDefined();
		expect(screen.queryByText("sign in")).toBeNull();
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
			const doc = test.useDocAccess(docQuery, handle);
			return <p>{Boundary.isUnhandled(doc) ? "missing" : doc.title}</p>;
		}
		using _view = await mount(test.view(<Title />));
		expect(screen.getByText(/crashed: Forbidden/)).toBeDefined();
		expect(screen.queryByText("forbidden 3")).toBeNull();
	});

	it("retry renders the children again, which refetches what failed", async () => {
		const test = setup("unauthorized");
		const Title = titleOf(test);
		using _view = await mount(test.view(<Title />));
		expect(test.state.calls).toBe(1);
		test.state.behavior = "ok";
		await act(async () => fireEvent.click(screen.getByText("sign in")));
		await settle();
		expect(screen.getByText("Doc 1")).toBeDefined();
		expect(test.state.calls).toBe(2);
	});

	it("retry refetches every failed query read under the boundary, not only the one it caught", async () => {
		const test = setup("unauthorized");
		const Title = titleOf(test);
		function List() {
			const docs = test.useAuth(docListQuery, test.list);
			return <p>{docs.length} docs</p>;
		}
		using _view = await mount(
			test.view(
				<>
					<Suspense fallback={null}>
						<List />
					</Suspense>
					<Suspense fallback={null}>
						<Title />
					</Suspense>
				</>,
			),
		);
		expect(screen.getByText("sign in")).toBeDefined();
		test.state.behavior = "ok";
		await act(async () => fireEvent.click(screen.getByText("sign in")));
		await settle();
		expect(screen.getByText("Doc 1")).toBeDefined();
		expect(screen.getByText("1 docs")).toBeDefined();
	});

	it("root's retry refetches a defect's query", async () => {
		const test = setup("die");
		const Title = titleOf(test);
		using _view = await mount(test.view(<Title />));
		test.state.behavior = "ok";
		await act(async () => fireEvent.click(screen.getByText(/crashed/)));
		await settle();
		expect(screen.getByText("Doc 1")).toBeDefined();
	});

	it("a hook throws without its boundary above it", async () => {
		const test = setup("ok");
		const Title = titleOf(test);
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
		const [App, useApp] = Boundary.root<Docs, AppError>({
			fallback: () => <p>crashed</p>,
			name: "App",
		});
		const handle = client.prefetch(docQuery, { id: 2 });
		function Title() {
			const doc = useApp(docQuery, handle);
			return <p>{Boundary.isUnhandled(doc) ? "failed" : doc.title}</p>;
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
			const run = Boundary.useRun(test.DocAccess);
			return (
				<button
					onClick={async () => {
						const doc = await run(getDoc(1));
						results.push(Boundary.isUnhandled(doc) ? doc.error._tag : "ok");
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
			const run = Boundary.useRun(test.Auth);
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
			test.useDocAccess(docQuery, handle),
		).returns.toEqualTypeOf<Doc | Boundary.Unhandled<NotFound>>();
		expectTypeOf(() => test.useAuth(docQuery, handle)).returns.toEqualTypeOf<
			Doc | Boundary.Unhandled<Forbidden | NotFound>
		>();
		expectTypeOf(() => test.useApp(docQuery, handle)).returns.toEqualTypeOf<
			Doc | Boundary.Unhandled<AppError>
		>();
		expectTypeOf<Boundary.HandledBy<typeof test.DocAccess>>().toEqualTypeOf<
			"Forbidden" | "Unauthorized"
		>();
	});

	it("returns plain data only when nothing is left", () => {
		expectTypeOf(() =>
			test.useAuth(docListQuery, listHandle),
		).returns.toEqualTypeOf<ReadonlyArray<Doc>>();
		expectTypeOf(() => {
			const doc = test.useDocAccess(docQuery, handle);
			// @ts-expect-error -- NotFound is left: check `isUnhandled` first
			return doc.title;
		}).toBeFunction();
		expectTypeOf(() => {
			const doc = test.useDocAccess(docQuery, handle);
			return Boundary.isUnhandled(doc) ? doc.error : doc.title;
		}).returns.toEqualTypeOf<NotFound | string>();
	});

	it("reads a promise queryFn's data plainly: its failures go to the root", () => {
		const plain = test.client.prefetch(plainQuery, { reason: undefined });
		expectTypeOf(() =>
			test.useApp(plainQuery, plain),
		).returns.toEqualTypeOf<string>();
	});

	it("gives the fallback the universe's type for its tags", () => {
		Boundary.catchErrors(test.Auth, {
			fallback: (props) => {
				expectTypeOf(props.error).toEqualTypeOf<Forbidden | NotFound>();
				return null;
			},
			name: "Both",
			tags: ["Forbidden", "NotFound"],
		});
	});

	it("rejects tags caught above, tags not in the universe, and no tags", () => {
		expectTypeOf(() =>
			Boundary.catchErrors(test.DocAccess, {
				fallback: () => null,
				name: "Again",
				// @ts-expect-error -- Auth catches Unauthorized
				tags: ["NotFound", "Unauthorized"],
			}),
		).toBeFunction();
		expectTypeOf(() =>
			Boundary.catchErrors(test.DocAccess, {
				fallback: () => null,
				name: "Typo",
				// @ts-expect-error -- not a tag of the universe
				tags: ["NotFund"],
			}),
		).toBeFunction();
		expectTypeOf(() =>
			Boundary.catchErrors(test.DocAccess, {
				fallback: () => null,
				name: "Empty",
				// @ts-expect-error -- at least one tag
				tags: [],
			}),
		).toBeFunction();
	});

	it("rejects a tag two errors of the universe share", () => {
		class OrgForbidden extends Data.TaggedError("Forbidden")<{
			readonly orgId: string;
		}> {}
		const [Shared] = Boundary.root({
			client: test.client,
			errors: Boundary.errors<Forbidden | OrgForbidden>(),
			fallback: () => null,
			name: "Shared",
		});
		expectTypeOf(() =>
			Boundary.catchErrors(Shared, {
				fallback: () => null,
				name: "Which",
				// @ts-expect-error -- Forbidden and OrgForbidden both carry "Forbidden"
				tags: ["Forbidden"],
			}),
		).toBeFunction();
	});

	it("needs a universe to catch anything", () => {
		const [Bare] = Boundary.root({
			client: test.client,
			fallback: () => null,
			name: "Bare",
		});
		expectTypeOf(() =>
			Boundary.catchErrors(Bare, {
				fallback: () => null,
				name: "Nothing",
				// @ts-expect-error -- the root declares no errors
				tags: ["Unauthorized"],
			}),
		).toBeFunction();
	});

	it("rejects a read whose query carries a caught tag as another type", () => {
		class OrgForbidden extends Data.TaggedError("Forbidden")<{
			readonly orgId: string;
		}> {}
		function orgQuery() {
			return queryOptions({
				queryFn: () => Effect.fail(new OrgForbidden({ orgId: "o" })),
				queryKey: ["org"],
			});
		}
		const org = test.client.prefetch(orgQuery);
		expectTypeOf(() =>
			// @ts-expect-error -- DocAccess's fallback expects the universe's Forbidden
			test.useDocAccess(orgQuery, org),
		).toBeFunction();
	});

	it("narrows useRun the same way", () => {
		expectTypeOf(() =>
			Boundary.useRun(test.DocAccess)(getDoc(1)),
		).returns.toEqualTypeOf<Promise<Doc | Boundary.Unhandled<NotFound>>>();
		expectTypeOf(() =>
			Boundary.useRun(test.DocAccess)(listDocs),
		).returns.toEqualTypeOf<Promise<ReadonlyArray<Doc>>>();
	});

	it("only runs Effects whose services the root provides", () => {
		class Analytics extends Context.Service<Analytics, number>()(
			"test/Analytics",
		) {}
		expectTypeOf(() =>
			// @ts-expect-error -- the client's layer doesn't provide Analytics
			Boundary.useRun(test.DocAccess)(Effect.service(Analytics)),
		).toBeFunction();
	});

	it("RpcErrors is what a group's client calls can fail with", () => {
		class Session extends RpcMiddleware.Service<Session>()("test/Session", {
			error: Unauthorized,
		}) {}
		const Rpcs = RpcGroup.make(
			Rpc.make("GetDoc", {
				error: Schema.Union([Forbidden]),
				payload: { id: Schema.Number },
				success: Schema.String,
			}),
		).middleware(Session);
		expectTypeOf<Boundary.RpcErrors<typeof Rpcs>>().toEqualTypeOf<
			Forbidden | RpcClientError.RpcClientError | Unauthorized
		>();
	});
});
