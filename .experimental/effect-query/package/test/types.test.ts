import { describe, expectTypeOf, it } from "@effect/vitest";
import { Context, Effect, Layer, Match, Result } from "effect";

import {
	Boundary,
	Mutation,
	Query,
	QueryCache,
	QueryClient,
} from "../src/index.ts";
import {
	type Doc,
	docQuery,
	docsLayer,
	Forbidden,
	NotFound,
	Unauthorized,
} from "./fixtures.ts";

const client = QueryClient.make(docsLayer(() => "ok"));
const [App, useApp] = Boundary.root({
	client,
	fallback: () => null,
	name: "App",
});
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
const [Everything, useEverything] = Boundary.catchErrors(DocBoundary, {
	errors: [NotFound],
	fallback: () => null,
	name: "All",
});

class Other extends Context.Service<Other, { readonly name: string }>()(
	"test/Other",
) {}

const needsOther = Query.make({
	effect: Effect.map(Other, (other) => other.name),
	errors: [],
	key: ["other"],
});

const [, useWithOther] = Boundary.root({
	client: QueryClient.make(Layer.succeed(Other, { name: "other" })),
	fallback: () => null,
	name: "WithOther",
});

describe("Boundary types", () => {
	it("a query's errors are its Effect's", () => {
		expectTypeOf<Query.Error<ReturnType<typeof docQuery>>>().toEqualTypeOf<
			Unauthorized | Forbidden | NotFound
		>();
	});

	it("the schemas are the query's errors, and the Effect fails with nothing else", () => {
		Query.make({
			// @ts-expect-error -- NotFound has no schema
			effect: Effect.fail(new NotFound({ id: 1 })),
			errors: [],
			key: ["missing"],
		});
		Mutation.make({
			// @ts-expect-error -- NotFound has no schema
			effect: Effect.fail(new NotFound({ id: 1 })),
			errors: [],
		});
		const extra = Query.make({
			effect: Effect.fail(new NotFound({ id: 1 })),
			errors: [NotFound, Forbidden],
			key: ["extra"],
		});
		expectTypeOf<Query.Error<typeof extra>>().toEqualTypeOf<
			NotFound | Forbidden
		>();
	});

	it("each boundary's hook takes its errors off the Result", () => {
		function useTypeOnly() {
			expectTypeOf(useApp(docQuery(1))).toEqualTypeOf<
				Result.Result<Doc, Unauthorized | Forbidden | NotFound>
			>();
			expectTypeOf(useAuth(docQuery(1))).toEqualTypeOf<
				Result.Result<Doc, Forbidden | NotFound>
			>();
			expectTypeOf(useDoc(docQuery(1))).toEqualTypeOf<
				Result.Result<Doc, NotFound>
			>();
		}
		expectTypeOf(useTypeOnly).toBeFunction();
	});

	it("when every error is handled, the hook returns the data itself", () => {
		function useTypeOnly() {
			expectTypeOf(useEverything(docQuery(1))).toEqualTypeOf<Doc>();
		}
		expectTypeOf(useTypeOnly).toBeFunction();
	});

	it("while errors are left, the data is behind the Result", () => {
		function useTypeOnly() {
			const doc = useDoc(docQuery(1));
			// @ts-expect-error -- NotFound is left, so this is a Result, not a Doc
			expectTypeOf(doc.title).toBeString();
		}
		expectTypeOf(useTypeOnly).toBeFunction();
		expectTypeOf<
			Boundary.Read<Doc, NotFound | Forbidden, Unauthorized>
		>().toEqualTypeOf<Result.Result<Doc, NotFound | Forbidden>>();
	});

	it("matching what's left must be exhaustive", () => {
		function useTypeOnly() {
			const result = useAuth(docQuery(1));
			if (Result.isFailure(result)) {
				// @ts-expect-error -- Forbidden is missing
				Match.valueTags(result.failure, { NotFound: () => "missing" });
				Match.valueTags(result.failure, {
					Forbidden: () => "no access",
					NotFound: () => "missing",
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

	it("the Provider carries what its chain handles", () => {
		expectTypeOf<Boundary.HandledBy<typeof DocBoundary>>().toEqualTypeOf<
			Unauthorized | Forbidden
		>();
		expectTypeOf<Boundary.HandledBy<typeof App>>().toEqualTypeOf<never>();
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

	it("a query needs only services the root's client provides", () => {
		function useTypeOnly() {
			// @ts-expect-error -- Other is not in the client's layer
			useApp(needsOther);
			expectTypeOf(useWithOther(needsOther)).toEqualTypeOf<string>();
		}
		expectTypeOf(useTypeOnly).toBeFunction();
	});

	it("useRun runs mutations that use the cache, with the same narrowing", () => {
		const rename = Mutation.make({
			effect: Effect.gen(function* () {
				const doc = yield* QueryCache.fetch(docQuery(1));
				yield* QueryCache.invalidate(["doc"]);
				return doc;
			}),
			errors: [Unauthorized, Forbidden, NotFound],
		});
		function useTypeOnly() {
			const run = Boundary.useRun(DocBoundary);
			expectTypeOf(run(rename)).toEqualTypeOf<
				Promise<Result.Result<Doc, NotFound>>
			>();
			const runAll = Boundary.useRun(Everything);
			expectTypeOf(runAll(rename)).toEqualTypeOf<Promise<Doc>>();
		}
		expectTypeOf(useTypeOnly).toBeFunction();
	});
});
