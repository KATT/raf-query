import {
	act,
	cleanup,
	fireEvent,
	render,
	type RenderOptions,
	screen,
} from "@testing-library/react";
import { Cause, Effect, Layer, Match, Result } from "effect";
import { Suspense } from "react";
import { describe, expect, it, vi } from "@effect/vitest";

import { Boundary, Mutation, QueryCache, QueryClient } from "../src/index.ts";
import {
	type Behavior,
	docQuery,
	docsLayer,
	Forbidden,
	NotFound,
	Unauthorized,
} from "./fixtures.ts";

const setup = (initial: Behavior) => {
	const state = { behavior: initial };
	const caught: Array<string> = [];
	const client = QueryClient.make(docsLayer(() => state.behavior));
	const [App, useApp] = Boundary.root({
		client,
		fallback: (props) => (
			<button onClick={props.retry} type="button">
				crashed: {Cause.pretty(props.cause).split("\n")[0]}
			</button>
		),
		name: "App",
		onCaught: (by) => {
			caught.push(`${by.name}: ${by.root ? "defect" : String(by.error)}`);
		},
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
	const [Doc, useDoc] = Boundary.catchErrors(Auth, {
		errors: [Forbidden],
		fallback: (props) => <p>forbidden {props.error.id}</p>,
		name: "Doc",
	});
	const [All, useAll] = Boundary.catchErrors(Doc, {
		errors: [NotFound],
		fallback: (props) => <p>gone {props.error.id}</p>,
		name: "All",
	});
	return {
		All,
		App,
		Auth,
		caught,
		client,
		Doc,
		state,
		useAll,
		useApp,
		useAuth,
		useDoc,
	};
};

type Setup = ReturnType<typeof setup>;

const tree = (app: Setup, children: React.ReactNode) => (
	<Suspense fallback={<p>loading</p>}>
		<app.App>
			<app.Auth>
				<app.Doc>{children}</app.Doc>
			</app.Auth>
		</app.App>
	</Suspense>
);

const settle = () =>
	act(() => new Promise((resolve) => setTimeout(resolve, 0)));

/** Renders `node` and lets its queries settle; disposing unmounts it. */
const mount = async (
	node: React.ReactNode,
	options?: Pick<RenderOptions, "onCaughtError">,
): Promise<Disposable> => {
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
};

describe("Boundary", () => {
	it("renders data once the query loads", async () => {
		const app = setup("ok");
		const Title = () => (
			<p>{app.useDoc(docQuery(1)).pipe(Result.getOrThrow).title}</p>
		);
		using _view = await mount(tree(app, <Title />));
		expect(screen.getByText("Doc 1")).toBeDefined();
	});

	it("returns the data itself when the chain catches every error", async () => {
		const app = setup("ok");
		const Title = () => <p>{app.useAll(docQuery(1)).title}</p>;
		using _view = await mount(
			tree(
				app,
				<app.All>
					<Title />
				</app.All>,
			),
		);
		expect(screen.getByText("Doc 1")).toBeDefined();
	});

	it("sends a typed failure to the boundary that catches it", async () => {
		const app = setup("unauthorized");
		const Title = () => (
			<p>{Result.getOrThrow(app.useDoc(docQuery(1))).title}</p>
		);
		using _view = await mount(tree(app, <Title />));
		expect(screen.getByText("sign in")).toBeDefined();
	});

	it("hands back the failures nothing above catches", async () => {
		const app = setup("missing");
		const Title = () =>
			Result.match(app.useDoc(docQuery(1)), {
				onFailure: (error) =>
					Match.valueTags(error, {
						NotFound: (missing) => <p>no doc {missing.id}</p>,
					}),
				onSuccess: (doc) => <p>{doc.title}</p>,
			});
		using _view = await mount(tree(app, <Title />));
		expect(screen.getByText("no doc 1")).toBeDefined();
	});

	it("routes by the chain a component reads through, not by what is mounted", async () => {
		const app = setup("forbidden");
		const Title = () =>
			Result.match(app.useAuth(docQuery(1)), {
				onFailure: (error) => <p>inline {error._tag}</p>,
				onSuccess: (doc) => <p>{doc.title}</p>,
			});
		using _view = await mount(tree(app, <Title />));
		expect(screen.getByText("inline Forbidden")).toBeDefined();
	});

	it("tells onCaught and onCaughtError which boundary caught what", async () => {
		const app = setup("forbidden");
		const caught: Array<string> = [];
		const onCaughtError: RenderOptions["onCaughtError"] = (error) => {
			const by = Boundary.caughtBy(error);
			caught.push(
				by === undefined ? "other" : `${by.name}: ${String(by.error)}`,
			);
		};
		const Title = () => (
			<p>{Result.getOrThrow(app.useDoc(docQuery(1))).title}</p>
		);
		using _view = await mount(tree(app, <Title />), { onCaughtError });
		expect(caught).toEqual(["Doc: Forbidden"]);
		expect(app.caught).toEqual(["Doc: Forbidden"]);
	});

	it("sends defects to the root", async () => {
		const app = setup("die");
		const Title = () => (
			<p>{Result.getOrThrow(app.useDoc(docQuery(1))).title}</p>
		);
		using _view = await mount(tree(app, <Title />));
		expect(screen.getByText(/crashed: Error: doc 1 exploded/)).toBeDefined();
		expect(app.caught).toEqual(["App: defect"]);
	});

	it("retry refetches what the boundary caught", async () => {
		const app = setup("unauthorized");
		const Title = () => (
			<p>{Result.getOrThrow(app.useDoc(docQuery(1))).title}</p>
		);
		using _view = await mount(tree(app, <Title />));
		app.state.behavior = "ok";
		await act(async () => fireEvent.click(screen.getByText("sign in")));
		await settle();
		expect(screen.getByText("Doc 1")).toBeDefined();
	});

	it("a hook throws without its boundary above it", async () => {
		const app = setup("ok");
		const Title = () => (
			<p>{Result.getOrThrow(app.useDoc(docQuery(1))).title}</p>
		);
		using _view = await mount(
			<Suspense fallback={null}>
				<app.App>
					<app.Auth>
						<Title />
					</app.Auth>
				</app.App>
			</Suspense>,
		);
		expect(screen.getByText(/Doc's hook needs <Doc> above it/)).toBeDefined();
	});

	it("a Provider throws without its parent above it", async () => {
		const app = setup("ok");
		using _view = await mount(
			<Suspense fallback={null}>
				<app.App>
					<app.Doc>
						<p>never</p>
					</app.Doc>
				</app.App>
			</Suspense>,
		);
		expect(screen.getByText(/<Doc> needs <Auth> above it/)).toBeDefined();
	});

	it("useRun hands back uncaught failures and escalates caught ones", async () => {
		const app = setup("missing");
		const results: Array<string> = [];
		const fetchDoc = Mutation.make({
			effect: QueryCache.fetch(docQuery(1)),
			errors: [Unauthorized, Forbidden, NotFound],
		});
		const Rename = () => {
			const run = Boundary.useRun(app.Doc);
			const onClick = async () => {
				const result = await run(fetchDoc);
				results.push(Result.isFailure(result) ? result.failure._tag : "ok");
			};
			return (
				<button onClick={onClick} type="button">
					rename
				</button>
			);
		};
		using _view = await mount(tree(app, <Rename />));
		await act(async () => fireEvent.click(screen.getByText("rename")));
		await settle();
		expect(results).toEqual(["NotFound"]);

		app.state.behavior = "unauthorized";
		await act(async () =>
			app.client.runtime.runPromise(QueryCache.invalidate(["doc"])),
		);
		await act(async () => fireEvent.click(screen.getByText("rename")));
		await settle();
		expect(screen.getByText("sign in")).toBeDefined();
		expect(results).toEqual(["NotFound"]);
	});

	it("useRun resolves with the data itself when nothing is left", async () => {
		const app = setup("ok");
		const titles: Array<string> = [];
		const fetchDoc = Mutation.make({
			effect: QueryCache.fetch(docQuery(1)),
			errors: [Unauthorized, Forbidden, NotFound],
		});
		const Load = () => {
			const run = Boundary.useRun(app.All);
			const onClick = async () => {
				titles.push((await run(fetchDoc)).title);
			};
			return (
				<button onClick={onClick} type="button">
					load
				</button>
			);
		};
		using _view = await mount(
			tree(
				app,
				<app.All>
					<Load />
				</app.All>,
			),
		);
		await act(async () => fireEvent.click(screen.getByText("load")));
		await settle();
		expect(titles).toEqual(["Doc 1"]);
	});

	it("a layer that fails to build renders the root's fallback", async () => {
		const client = QueryClient.make(
			Layer.effectDiscard(Effect.die("no database")),
		);
		const [App] = Boundary.root({
			client,
			fallback: (props) => <p>crashed: {String(Cause.squash(props.cause))}</p>,
			name: "App",
		});
		using _view = await mount(
			<Suspense fallback={null}>
				<App>
					<p>never</p>
				</App>
			</Suspense>,
		);
		expect(screen.getByText("crashed: no database")).toBeDefined();
	});

	it("a boundary is a component named after it, for React DevTools", () => {
		const app = setup("ok");
		expect(Boundary.isBoundary(app.Doc)).toBe(true);
		expect(app.Doc.displayName).toBe("Doc");
	});
});
