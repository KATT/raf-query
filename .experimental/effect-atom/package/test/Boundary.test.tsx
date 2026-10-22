import { RegistryContext } from "@effect/atom-react";
import {
	act,
	cleanup,
	fireEvent,
	render,
	type RenderOptions,
	screen,
} from "@testing-library/react";
import { Cause, Match } from "effect";
import { AtomRegistry } from "effect/reactivity";
import { Suspense } from "react";
import { describe, expect, it, vi } from "@effect/vitest";

import { Boundary } from "../src/index.ts";
import { type Behavior, type DocError, makeDocs } from "./fixtures.ts";

const setup = (
	initial: Behavior,
	onCaught?: (caught: Boundary.Caught) => void,
) => {
	const docs = makeDocs(initial);
	const [App, useApp] = Boundary.root({
		errors: Boundary.errors<DocError>(),
		fallback: (props) => (
			<button onClick={props.retry} type="button">
				crashed: {Cause.pretty(props.cause).split("\n")[0]}
			</button>
		),
		name: "App",
		onCaught,
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
	const [Doc, useDoc] = Boundary.catchErrors(Auth, {
		fallback: (props) => (
			<button onClick={props.retry} type="button">
				forbidden {props.error.id}
			</button>
		),
		name: "Doc",
		tags: ["Forbidden"],
	});
	const registry = AtomRegistry.make();
	return { App, Auth, Doc, docs, registry, useApp, useAuth, useDoc };
};

type Setup = ReturnType<typeof setup>;

const tree = (app: Setup, children: React.ReactNode) => (
	<RegistryContext value={app.registry}>
		<Suspense fallback={<p>loading</p>}>
			<app.App>
				<app.Auth>
					<app.Doc>{children}</app.Doc>
				</app.Auth>
			</app.App>
		</Suspense>
	</RegistryContext>
);

const settle = (ms = 0) =>
	act(() => new Promise((resolve) => setTimeout(resolve, ms)));

/** Renders `node` and lets its atoms settle; disposing unmounts it. */
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

const title = (
	doc: { readonly title: string } | Boundary.Unhandled<unknown>,
) => (Boundary.isUnhandled(doc) ? "unhandled" : doc.title);

describe("Boundary", () => {
	it("renders data once the atom loads", async () => {
		const app = setup("ok");
		const Title = () => <p>{title(app.useDoc(app.docs.docAtom(1)))}</p>;
		using _view = await mount(tree(app, <Title />));
		expect(screen.getByText("Doc 1")).toBeDefined();
	});

	it("sends a typed failure to the boundary that catches it", async () => {
		const app = setup("unauthorized");
		const Title = () => <p>{title(app.useDoc(app.docs.docAtom(1)))}</p>;
		using _view = await mount(tree(app, <Title />));
		expect(screen.getByText("sign in")).toBeDefined();
	});

	it("hands back the failures nothing above catches", async () => {
		const app = setup("missing");
		const Title = () => {
			const doc = app.useDoc(app.docs.docAtom(1));
			return (
				<p>
					{Boundary.isUnhandled(doc)
						? Match.valueTags(doc.error, {
								NotFound: (missing) => `no doc ${missing.id}`,
							})
						: doc.title}
				</p>
			);
		};
		using _view = await mount(tree(app, <Title />));
		expect(screen.getByText("no doc 1")).toBeDefined();
	});

	it("routes by the chain a component reads through, not by what is mounted", async () => {
		const app = setup("forbidden");
		const Title = () => {
			const doc = app.useAuth(app.docs.docAtom(1));
			return Boundary.isUnhandled(doc) ? (
				<p>inline {doc.error._tag}</p>
			) : (
				<p>{doc.title}</p>
			);
		};
		using _view = await mount(tree(app, <Title />));
		expect(screen.getByText("inline Forbidden")).toBeDefined();
	});

	it("tells onCaughtError which boundary caught what, once", async () => {
		const caught: Array<string> = [];
		const onCaughtError: RenderOptions["onCaughtError"] = (error) => {
			const by = Boundary.caughtBy(error);
			caught.push(
				by === undefined
					? "other"
					: `${by.name}${by.root ? " (root)" : ""}: ${String(by.error)}`,
			);
		};
		const forbidden = setup("forbidden");
		const Title = () => (
			<p>{title(forbidden.useDoc(forbidden.docs.docAtom(1)))}</p>
		);
		{
			using _view = await mount(tree(forbidden, <Title />), { onCaughtError });
			expect(caught).toEqual(["Doc: Forbidden"]);
		}
		caught.length = 0;
		const signedOut = setup("unauthorized");
		const Other = () => (
			<p>{title(signedOut.useDoc(signedOut.docs.docAtom(1)))}</p>
		);
		using _view = await mount(tree(signedOut, <Other />), { onCaughtError });
		expect(caught).toEqual(["Auth: Unauthorized"]);
	});

	it("reports each failure to the root's onCaught, from the boundary that renders its fallback", async () => {
		const caught: Array<string> = [];
		const onCaught = (by: Boundary.Caught) =>
			caught.push(`${by.name} ${by.root} ${String(by.error)}`);
		const forbidden = setup("forbidden", onCaught);
		const Title = () => (
			<p>{title(forbidden.useDoc(forbidden.docs.docAtom(1)))}</p>
		);
		{
			using _view = await mount(tree(forbidden, <Title />));
			expect(caught).toEqual(["Doc false Forbidden"]);
		}
		caught.length = 0;
		const signedOut = setup("unauthorized", onCaught);
		const Other = () => (
			<p>{title(signedOut.useDoc(signedOut.docs.docAtom(1)))}</p>
		);
		{
			using _view = await mount(tree(signedOut, <Other />));
			expect(caught).toEqual(["Auth false Unauthorized"]);
		}
		caught.length = 0;
		const crashing = setup("ok", onCaught);
		const Crash = () => {
			throw new Error("render bug");
		};
		using _view = await mount(tree(crashing, <Crash />));
		expect(caught).toEqual(["App true undefined"]);
	});

	it("catches by tag: a plain object with a caught tag reaches that boundary", async () => {
		const app = setup("lie-plain-forbidden");
		const Title = () => <p>{title(app.useDoc(app.docs.docAtom(1)))}</p>;
		using _view = await mount(tree(app, <Title />));
		expect(screen.getByText("forbidden 1")).toBeDefined();
	});

	it("hands back a failure with no tag, whatever its type says", async () => {
		const app = setup("lie-untagged");
		const Title = () => <p>{title(app.useDoc(app.docs.docAtom(1)))}</p>;
		using _view = await mount(tree(app, <Title />));
		expect(screen.getByText("unhandled")).toBeDefined();
	});

	it("sends a tagged defect to the root, not the boundary for its tag", async () => {
		const app = setup("die-tagged");
		const Title = () => <p>{title(app.useDoc(app.docs.docAtom(1)))}</p>;
		using _view = await mount(tree(app, <Title />));
		expect(screen.getByText(/crashed: Forbidden/)).toBeDefined();
	});

	it("sends defects to the root", async () => {
		const app = setup("die");
		const Title = () => <p>{title(app.useDoc(app.docs.docAtom(1)))}</p>;
		const caught: Array<string> = [];
		using _view = await mount(tree(app, <Title />), {
			onCaughtError: (error) => {
				const by = Boundary.caughtBy(error);
				caught.push(`${by?.name} ${by?.root} ${String(by?.error)}`);
			},
		});
		expect(screen.getByText(/crashed: Error: doc 1 exploded/)).toBeDefined();
		expect(caught).toEqual(["App true undefined"]);
	});

	it("retry refreshes what the boundary caught, once, and suspends while it does", async () => {
		const app = setup("unauthorized");
		const Title = () => <p>{title(app.useDoc(app.docs.docAtom(1)))}</p>;
		using _view = await mount(tree(app, <Title />));
		expect(app.docs.state.calls).toBe(1);
		app.docs.state.behavior = "ok";
		app.docs.state.latency = 10;
		await act(async () => fireEvent.click(screen.getByText("sign in")));
		// The atom's refresh is a failure that is waiting: loading, not caught again.
		expect(screen.getByText("loading")).toBeDefined();
		await settle(400);
		expect(screen.getByText("Doc 1")).toBeDefined();
		// The atom and the reactivity atom over it refresh as one.
		expect(app.docs.state.calls).toBe(2);
	});

	it("a refresh of a failure suspends instead of escalating it again", async () => {
		const app = setup("missing");
		const Title = () => <p>{title(app.useDoc(app.docs.docAtom(1)))}</p>;
		using _view = await mount(tree(app, <Title />));
		expect(screen.getByText("unhandled")).toBeDefined();
		app.docs.state.behavior = "unauthorized";
		await act(async () => app.registry.refresh(app.docs.docAtom(1)));
		await settle();
		expect(screen.getByText("sign in")).toBeDefined();
		app.docs.state.behavior = "ok";
		app.docs.state.latency = 10;
		await act(async () => fireEvent.click(screen.getByText("sign in")));
		expect(screen.getByText("loading")).toBeDefined();
		await settle(400);
		expect(screen.getByText("Doc 1")).toBeDefined();
	});

	it("a hook throws without its boundary above it", async () => {
		const app = setup("ok");
		const Title = () => <p>{title(app.useDoc(app.docs.docAtom(1)))}</p>;
		using _view = await mount(
			<Suspense fallback={null}>
				<app.App>
					<app.Auth>
						<Title />
					</app.Auth>
				</app.App>
			</Suspense>,
		);
		expect(screen.getByText(/useDoc\(\) needs <Doc> above it/)).toBeDefined();
	});

	it("a boundary throws without its parent above it", async () => {
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

	it("useSet hands back uncaught failures, escalates caught ones, and retry doesn't write again", async () => {
		const app = setup("missing");
		const results: Array<string> = [];
		const Rename = () => {
			const rename = Boundary.useSet(app.Doc, app.docs.rename);
			const onClick = async () => {
				const doc = await rename(1);
				results.push(Boundary.isUnhandled(doc) ? doc.error._tag : doc.title);
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

		app.docs.state.behavior = "forbidden";
		await act(async () => fireEvent.click(screen.getByText("rename")));
		await settle();
		expect(screen.getByText("forbidden 1")).toBeDefined();
		expect(results).toEqual(["NotFound"]);
		expect(app.docs.state.calls).toBe(2);

		app.docs.state.behavior = "ok";
		await act(async () => fireEvent.click(screen.getByText("forbidden 1")));
		await settle();
		expect(screen.getByText("rename")).toBeDefined();
		expect(app.docs.state.calls).toBe(2);

		await act(async () => fireEvent.click(screen.getByText("rename")));
		await settle();
		expect(results).toEqual(["NotFound", "Doc 1"]);
	});

	it("the root's retry refreshes a defect", async () => {
		const app = setup("die");
		const Title = () => <p>{title(app.useApp(app.docs.docAtom(1)))}</p>;
		using _view = await mount(tree(app, <Title />));
		app.docs.state.behavior = "ok";
		await act(async () =>
			fireEvent.click(screen.getByText(/crashed: Error: doc 1 exploded/)),
		);
		await settle();
		expect(screen.getByText("Doc 1")).toBeDefined();
	});
});
