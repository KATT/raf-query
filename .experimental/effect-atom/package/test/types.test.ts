import { describe, expectTypeOf, it } from "@effect/vitest";
import { Context, Effect, Layer, Match } from "effect";
import { AsyncResult, Atom } from "effect/reactivity";

import { Boundary } from "../src/index.ts";
import {
	type Doc,
	Forbidden,
	makeDocs,
	NotFound,
	Unauthorized,
} from "./fixtures.ts";

const docs = makeDocs("ok");
const [App, useApp] = Boundary.root({ fallback: () => null, name: "App" });
const [Auth, useAuth] = Boundary.catchErrors(App, {
	errors: [Unauthorized],
	fallback: () => null,
	name: "Auth",
});
const [DocBoundary, useDoc] = Boundary.catchErrors(Auth, {
	errors: [Forbidden],
	fallback: () => null,
	name: "Doc",
});
const [, useEverything] = Boundary.catchErrors(DocBoundary, {
	errors: [NotFound],
	fallback: () => null,
	name: "All",
});

class Other extends Context.Service<Other, { readonly name: string }>()(
	"test/Other",
) {}

const needsOther = Effect.map(Other, (other) => other.name);

describe("Boundary types", () => {
	it("an atom's errors are its Effect's", () => {
		expectTypeOf(docs.docAtom(1)).toEqualTypeOf<
			Atom.Atom<
				AsyncResult.AsyncResult<Doc, Unauthorized | Forbidden | NotFound>
			>
		>();
	});

	it("each boundary takes its errors off what its hook hands back", () => {
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

	it("a boundary can't catch what one above it already catches", () => {
		Boundary.catchErrors(DocBoundary, {
			// @ts-expect-error -- Auth already catches Unauthorized
			errors: [Unauthorized],
			fallback: () => null,
			name: "Again",
		});
		expectTypeOf<
			Boundary.NotYetHandled<
				[typeof Unauthorized, typeof NotFound],
				Unauthorized | Forbidden
			>
		>().toEqualTypeOf<{ readonly AlreadyHandledAbove: "Unauthorized" }>();
	});

	it("the fallback gets the boundary's own errors", () => {
		Boundary.catchErrors(Auth, {
			errors: [Forbidden, NotFound],
			fallback: (props) => {
				expectTypeOf(props.error).toEqualTypeOf<Forbidden | NotFound>();
				return null;
			},
			name: "Two",
		});
	});

	it("HandledBy reads a boundary's errors", () => {
		expectTypeOf<Boundary.HandledBy<typeof App>>().toEqualTypeOf<never>();
		expectTypeOf<Boundary.HandledBy<typeof DocBoundary>>().toEqualTypeOf<
			Unauthorized | Forbidden
		>();
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
			expectTypeOf(useDoc.useSet(docs.rename)).toEqualTypeOf<
				(value: number) => Promise<Doc | Boundary.Unhandled<NotFound>>
			>();
			expectTypeOf(useEverything.useSet(docs.rename)).toEqualTypeOf<
				(value: number) => Promise<Doc>
			>();
		}
		expectTypeOf(useTypeOnly).toBeFunction();
	});
});
