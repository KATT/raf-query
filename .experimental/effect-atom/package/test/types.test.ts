import { describe, expectTypeOf, it } from "@effect/vitest";
import { Context, Effect, Layer, Match, Schema } from "effect";
import { AsyncResult, Atom, AtomRpc } from "effect/reactivity";
import { Rpc, type RpcClientError, RpcGroup, RpcMiddleware } from "effect/rpc";

import { Boundary } from "../src/index.ts";
import {
	type Doc,
	type DocError,
	type Forbidden,
	makeDocs,
	type NotFound,
	type Unauthorized,
} from "./fixtures.ts";

const docs = makeDocs("ok");
const [App, useApp] = Boundary.root({
	errors: Boundary.errors<DocError>(),
	fallback: () => null,
	name: "App",
});
const [Auth, useAuth] = Boundary.catchErrors(App, {
	fallback: () => null,
	name: "Auth",
	tags: ["Unauthorized"],
});
const [DocBoundary, useDoc] = Boundary.catchErrors(Auth, {
	fallback: () => null,
	name: "Doc",
	tags: ["Forbidden"],
});
const [Everything, useEverything] = Boundary.catchErrors(DocBoundary, {
	fallback: () => null,
	name: "All",
	tags: ["NotFound"],
});

class Other extends Context.Service<Other, { readonly name: string }>()(
	"test/Other",
) {}

const needsOther = Effect.map(Other, (other) => other.name);

/** Another error that calls itself `Forbidden`. */
interface OrgForbidden {
	readonly _tag: "Forbidden";
	readonly orgId: string;
}

declare const orgAtom: Atom.Atom<AsyncResult.AsyncResult<string, OrgForbidden>>;
declare const looseAtom: Atom.Atom<
	AsyncResult.AsyncResult<string, { readonly _tag: string }>
>;

describe("Boundary types", () => {
	it("an atom's errors are its Effect's", () => {
		expectTypeOf(docs.docAtom(1)).toEqualTypeOf<
			Atom.Atom<
				AsyncResult.AsyncResult<Doc, Unauthorized | Forbidden | NotFound>
			>
		>();
	});

	it("each boundary takes its tags off what its hook hands back", () => {
		function useTypeOnly() {
			expectTypeOf(useApp(docs.docAtom(1))).toEqualTypeOf<
				Doc | Boundary.Unhandled<Unauthorized | Forbidden | NotFound>
			>();
			expectTypeOf(useAuth(docs.docAtom(1))).toEqualTypeOf<
				Doc | Boundary.Unhandled<Forbidden | NotFound>
			>();
			expectTypeOf(useDoc(docs.docAtom(1))).toEqualTypeOf<
				Doc | Boundary.Unhandled<NotFound>
			>();
		}
		expectTypeOf(useTypeOnly).toBeFunction();
	});

	it("when every error is handled, the hook returns the data", () => {
		function useTypeOnly() {
			expectTypeOf(useEverything(docs.docAtom(1))).toEqualTypeOf<Doc>();
			expectTypeOf(useEverything(docs.docAtom(1)).title).toBeString();
		}
		expectTypeOf(useTypeOnly).toBeFunction();
	});

	it("the data can't be used while errors are left", () => {
		function useTypeOnly() {
			// @ts-expect-error -- NotFound is not handled
			expectTypeOf(useDoc(docs.docAtom(1)).title).toBeString();
			const doc = useDoc(docs.docAtom(1));
			if (!Boundary.isUnhandled(doc)) {
				expectTypeOf(doc.title).toBeString();
			}
		}
		expectTypeOf(useTypeOnly).toBeFunction();
	});

	it("matching what's left must be exhaustive", () => {
		function useTypeOnly() {
			const doc = useAuth(docs.docAtom(1));
			if (Boundary.isUnhandled(doc)) {
				// @ts-expect-error -- Forbidden is missing
				Match.valueTags(doc.error, { NotFound: () => "missing" });
				Match.valueTags(doc.error, {
					Forbidden: () => "no access",
					NotFound: () => "missing",
				});
			}
		}
		expectTypeOf(useTypeOnly).toBeFunction();
	});

	it("an error a boundary caught can't be handled again below it", () => {
		function useTypeOnly() {
			const doc = useDoc(docs.docAtom(1));
			if (Boundary.isUnhandled(doc)) {
				Match.valueTags(doc.error, {
					NotFound: () => "missing",
					// @ts-expect-error -- Auth caught Unauthorized
					Unauthorized: () => "sign in",
				});
			}
		}
		expectTypeOf(useTypeOnly).toBeFunction();
	});

	it("tags must be the universe's", () => {
		expectTypeOf<Boundary.Catchable<typeof App>>().toEqualTypeOf<
			ReadonlyArray<"Unauthorized" | "Forbidden" | "NotFound">
		>();
		Boundary.catchErrors(App, {
			fallback: () => null,
			name: "Typo",
			// @ts-expect-error -- TS2820: Did you mean '"Forbidden"'?
			tags: ["Forbiden"],
		});
	});

	it("a boundary can't catch what one above it already catches", () => {
		Boundary.catchErrors(DocBoundary, {
			fallback: () => null,
			name: "Again",
			// @ts-expect-error -- AlreadyHandledAbove: "Unauthorized"
			tags: ["NotFound", "Unauthorized"],
		});
		expectTypeOf<
			Boundary.TagChecks<DocError, "Unauthorized", "NotFound" | "Unauthorized">
		>().toEqualTypeOf<{ readonly AlreadyHandledAbove: "Unauthorized" }>();
	});

	it("a boundary catches at least one tag", () => {
		Boundary.catchErrors(App, {
			fallback: () => null,
			name: "Nothing",
			// @ts-expect-error -- AtLeastOneTag
			tags: [],
		});
		expectTypeOf<Boundary.TagChecks<DocError, never, never>>().toEqualTypeOf<{
			readonly AtLeastOneTag: true;
		}>();
	});

	it("a tag two errors of the universe share can't be caught", () => {
		const [Shared] = Boundary.root({
			errors: Boundary.errors<DocError | OrgForbidden>(),
			fallback: () => null,
			name: "Shared",
		});
		Boundary.catchErrors(Shared, {
			fallback: () => null,
			name: "Ambiguous",
			// @ts-expect-error -- TagSharedByMoreThanOneError: "Forbidden"
			tags: ["Forbidden"],
		});
		Boundary.catchErrors(Shared, {
			fallback: () => null,
			name: "Fine",
			tags: ["NotFound"],
		});
		expectTypeOf<
			Boundary.SharedTags<DocError | OrgForbidden, "Forbidden" | "NotFound">
		>().toEqualTypeOf<"Forbidden">();
	});

	it("an atom can't carry a caught tag as another type", () => {
		function useTypeOnly() {
			// @ts-expect-error -- CaughtAsAnotherType: "Forbidden"
			useDoc(orgAtom);
			// @ts-expect-error -- a `_tag: string` could be any caught tag
			useDoc(looseAtom);
			expectTypeOf(useApp(orgAtom)).toEqualTypeOf<
				string | Boundary.Unhandled<OrgForbidden>
			>();
		}
		expectTypeOf(useTypeOnly).toBeFunction();
	});

	it("without a universe, nothing can be caught, and the error says why", () => {
		const [Bare] = Boundary.root({ fallback: () => null, name: "Bare" });
		expectTypeOf<Boundary.Catchable<typeof Bare>>().toEqualTypeOf<
			ReadonlyArray<Boundary.NoUniverse>
		>();
		Boundary.catchErrors(Bare, {
			fallback: () => null,
			name: "Lost",
			// @ts-expect-error -- NoUniverse
			tags: ["Unauthorized"],
		});
	});

	it("the fallback gets the universe's types for its tags", () => {
		Boundary.catchErrors(Auth, {
			fallback: (props) => {
				expectTypeOf(props.error).toEqualTypeOf<Forbidden | NotFound>();
				return null;
			},
			name: "Two",
			tags: ["Forbidden", "NotFound"],
		});
	});

	it("HandledBy reads a boundary's tags", () => {
		expectTypeOf<Boundary.HandledBy<typeof App>>().toEqualTypeOf<never>();
		expectTypeOf<Boundary.HandledBy<typeof DocBoundary>>().toEqualTypeOf<
			"Unauthorized" | "Forbidden"
		>();
		expectTypeOf<
			Boundary.UniverseOf<typeof DocBoundary>
		>().toEqualTypeOf<DocError>();
	});

	it("an atom's services are checked against its runtime when it is made", () => {
		// @ts-expect-error -- Other is not in the runtime's layer
		docs.runtime.atom(needsOther);
		const withOther = Atom.runtime(Layer.succeed(Other, { name: "other" }));
		expectTypeOf(withOther.atom(needsOther)).toEqualTypeOf<
			Atom.Atom<AsyncResult.AsyncResult<string, never>>
		>();
		function useTypeOnly() {
			expectTypeOf(useApp(withOther.atom(needsOther))).toEqualTypeOf<string>();
		}
		expectTypeOf(useTypeOnly).toBeFunction();
	});

	it("useSet writes a function atom, with the same narrowing", () => {
		function useTypeOnly() {
			expectTypeOf(Boundary.useSet(DocBoundary, docs.rename)).toEqualTypeOf<
				(value: number) => Promise<Doc | Boundary.Unhandled<NotFound>>
			>();
			expectTypeOf(Boundary.useSet(Everything, docs.rename)).toEqualTypeOf<
				(value: number) => Promise<Doc>
			>();
		}
		expectTypeOf(useTypeOnly).toBeFunction();
	});
});

class Denied extends Schema.TaggedError<Denied>()("Denied", {}) {}
class Missing extends Schema.TaggedError<Missing>()("Missing", {}) {}
class Gate extends RpcMiddleware.Service<Gate>()("test/Gate", {
	error: Denied,
}) {}
const Rpcs = RpcGroup.make(
	Rpc.make("Get", { error: Missing, success: Schema.String }),
	Rpc.make("List", { success: Schema.Array(Schema.String) }),
).middleware(Gate);

class Client extends AtomRpc.Service<Client>()("test/Client", {
	group: Rpcs,
	makeEffect: Effect.die("type only"),
	protocol: Layer.empty,
}) {}

describe("RpcErrors", () => {
	it("is every procedure's errors, the middlewares', and the transport's", () => {
		expectTypeOf<Boundary.RpcErrors<typeof Rpcs>>().toEqualTypeOf<
			Missing | Denied | RpcClientError.RpcClientError
		>();
	});

	it("covers what an AtomRpc query fails with", () => {
		const get = Client.query("Get", undefined);
		type Failure =
			typeof get extends Atom.Atom<AsyncResult.AsyncResult<infer _A, infer E>>
				? E
				: never;
		expectTypeOf<Failure>().toExtend<Boundary.RpcErrors<typeof Rpcs>>();
	});
});
