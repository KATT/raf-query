import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { Cause, Effect, Layer, Match, Result } from "effect";
import { Suspense } from "react";
import { describe, expect, it, vi } from "@effect/vitest";

import { Boundary, QueryCache, QueryClient } from "../src/index.ts";
import {
	type Behavior,
	docQuery,
	docsLayer,
	Forbidden,
	Unauthorized,
} from "./fixtures.ts";

const setup = (initial: Behavior) => {
	const state = { behavior: initial };
	const client = QueryClient.make(docsLayer(() => state.behavior));
	const App = Boundary.root({
		client,
		fallback: (props) => (
			<button onClick={props.retry} type="button">
				crashed: {Cause.pretty(props.cause).split("\n")[0]}
			</button>
		),
		name: "App",
	});
	const Auth = App.catchErrors({
		errors: [Unauthorized],
		fallback: (props) => (
			<button onClick={props.retry} type="button">
				sign in
			</button>
		),
		name: "Auth",
	});
	const Doc = Auth.catchErrors({
		errors: [Forbidden],
		fallback: (props) => <p>forbidden {props.error.id}</p>,
		name: "Doc",
	});
	return { App, Auth, client, Doc, state };
};

type Setup = ReturnType<typeof setup>;

const tree = (app: Setup, children: React.ReactNode) => (
	<Suspense fallback={<p>loading</p>}>
		<app.App.Provider>
			<app.Auth.Provider>
				<app.Doc.Provider>{children}</app.Doc.Provider>
			</app.Auth.Provider>
		</app.App.Provider>
	</Suspense>
);

const settle = () =>
	act(() => new Promise((resolve) => setTimeout(resolve, 0)));

/** Renders `node` and lets its queries settle; disposing unmounts it. */
const mount = async (node: React.ReactNode): Promise<Disposable> => {
	// React logs every error a boundary catches.
	const errors = vi.spyOn(console, "error").mockImplementation(() => {});
	await act(async () => render(node));
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
			<p>{app.Doc.useResult(docQuery(1)).pipe(Result.getOrThrow).title}</p>
		);
		using _view = await mount(tree(app, <Title />));
		expect(screen.getByText("Doc 1")).toBeDefined();
	});

	it("sends a typed failure to the boundary that catches it", async () => {
		const app = setup("unauthorized");
		const Title = () => (
			<p>{Result.getOrThrow(app.Doc.useResult(docQuery(1))).title}</p>
		);
		using _view = await mount(tree(app, <Title />));
		expect(screen.getByText("sign in")).toBeDefined();
	});

	it("hands back the failures nothing above catches", async () => {
		const app = setup("missing");
		const Title = () =>
			Result.match(app.Doc.useResult(docQuery(1)), {
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
			Result.match(app.Auth.useResult(docQuery(1)), {
				onFailure: (error) => <p>inline {error._tag}</p>,
				onSuccess: (doc) => <p>{doc.title}</p>,
			});
		using _view = await mount(tree(app, <Title />));
		expect(screen.getByText("inline Forbidden")).toBeDefined();
	});

	it("sends defects to the root", async () => {
		const app = setup("die");
		const Title = () => (
			<p>{Result.getOrThrow(app.Doc.useResult(docQuery(1))).title}</p>
		);
		using _view = await mount(tree(app, <Title />));
		expect(screen.getByText(/crashed: Error: doc 1 exploded/)).toBeDefined();
	});

	it("retry refetches what the boundary caught", async () => {
		const app = setup("unauthorized");
		const Title = () => (
			<p>{Result.getOrThrow(app.Doc.useResult(docQuery(1))).title}</p>
		);
		using _view = await mount(tree(app, <Title />));
		app.state.behavior = "ok";
		await act(async () => fireEvent.click(screen.getByText("sign in")));
		await settle();
		expect(screen.getByText("Doc 1")).toBeDefined();
	});

	it("a hook throws without its boundary's Provider above it", async () => {
		const app = setup("ok");
		const Title = () => (
			<p>{Result.getOrThrow(app.Doc.useResult(docQuery(1))).title}</p>
		);
		using _view = await mount(
			<Suspense fallback={null}>
				<app.App.Provider>
					<app.Auth.Provider>
						<Title />
					</app.Auth.Provider>
				</app.App.Provider>
			</Suspense>,
		);
		expect(
			screen.getByText(/Doc.useResult\(\) needs <Doc.Provider> above it/),
		).toBeDefined();
	});

	it("a Provider throws without its parent's Provider above it", async () => {
		const app = setup("ok");
		using _view = await mount(
			<Suspense fallback={null}>
				<app.App.Provider>
					<app.Doc.Provider>
						<p>never</p>
					</app.Doc.Provider>
				</app.App.Provider>
			</Suspense>,
		);
		expect(
			screen.getByText(/<Doc.Provider> needs <Auth.Provider> above it/),
		).toBeDefined();
	});

	it("useRun hands back uncaught failures and escalates caught ones", async () => {
		const app = setup("missing");
		const results: Array<string> = [];
		const Rename = () => {
			const run = app.Doc.useRun();
			const onClick = async () => {
				const result = await run(QueryCache.fetch(docQuery(1)));
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

	it("a layer that fails to build renders the root's fallback", async () => {
		const client = QueryClient.make(
			Layer.effectDiscard(Effect.die("no database")),
		);
		const App = Boundary.root({
			client,
			fallback: (props) => <p>crashed: {String(Cause.squash(props.cause))}</p>,
			name: "App",
		});
		using _view = await mount(
			<Suspense fallback={null}>
				<App.Provider>
					<p>never</p>
				</App.Provider>
			</Suspense>,
		);
		expect(screen.getByText("crashed: no database")).toBeDefined();
	});
});
