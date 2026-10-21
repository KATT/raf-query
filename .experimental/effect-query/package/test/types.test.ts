import { describe, expectTypeOf, it } from "@effect/vitest";
import { Context, Effect, Layer, Match, Result } from "effect";

import { Boundary, Query, QueryCache, QueryClient } from "../src/index.ts";
import {
	type Doc,
	docQuery,
	docsLayer,
	Forbidden,
	NotFound,
	Unauthorized,
} from "./fixtures.ts";

const client = QueryClient.make(docsLayer(() => "ok"));
const App = Boundary.root({ client, fallback: () => null, name: "App" });
const Auth = App.catchErrors({
	errors: [Unauthorized],
	fallback: () => null,
	name: "Auth",
});
const DocBoundary = Auth.catchErrors({
	errors: [Forbidden],
	fallback: () => null,
	name: "Doc",
});
const Everything = DocBoundary.catchErrors({
	errors: [NotFound],
	fallback: () => null,
	name: "All",
});

class Other extends Context.Service<Other, { readonly name: string }>()(
	"test/Other",
) {}

const needsOther = Query.make({
	effect: Effect.map(Other, (other) => other.name),
	key: ["other"],
});

const WithOther = Boundary.root({
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

	it("each boundary takes its errors off what useResult hands back", () => {
		function useTypeOnly() {
			expectTypeOf(App.useResult(docQuery(1))).toEqualTypeOf<
				Result.Result<Doc, Unauthorized | Forbidden | NotFound>
			>();
			expectTypeOf(Auth.useResult(docQuery(1))).toEqualTypeOf<
				Result.Result<Doc, Forbidden | NotFound>
			>();
			expectTypeOf(DocBoundary.useResult(docQuery(1))).toEqualTypeOf<
				Result.Result<Doc, NotFound>
			>();
		}
		expectTypeOf(useTypeOnly).toBeFunction();
	});

	it("when every error is handled, there is no failure to get", () => {
		function useTypeOnly() {
			expectTypeOf(Everything.useResult(docQuery(1))).toEqualTypeOf<
				Result.Result<Doc, never>
			>();
			expectTypeOf(Everything.use(docQuery(1))).toEqualTypeOf<Doc>();
		}
		expectTypeOf(useTypeOnly).toBeFunction();
	});

	it("use doesn't type-check while errors are left, and names them", () => {
		function useTypeOnly() {
			// @ts-expect-error -- NotFound is not handled
			DocBoundary.use(docQuery(1));
			// @ts-expect-error -- Forbidden and NotFound are not handled
			Auth.use(docQuery(1));
		}
		expectTypeOf(useTypeOnly).toBeFunction();
		expectTypeOf<
			Boundary.Exhausted<NotFound | Forbidden, Unauthorized>
		>().toEqualTypeOf<{
			readonly UnhandledErrors: "NotFound" | "Forbidden";
		}>();
	});

	it("matching what's left must be exhaustive", () => {
		function useTypeOnly() {
			const result = Auth.useResult(docQuery(1));
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
		DocBoundary.catchErrors({
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
		Auth.catchErrors({
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
			App.useResult(needsOther);
			expectTypeOf(WithOther.useResult(needsOther)).toEqualTypeOf<
				Result.Result<string, never>
			>();
		}
		expectTypeOf(useTypeOnly).toBeFunction();
	});

	it("useRun runs Effects that use the cache, with the same narrowing", () => {
		const rename = Effect.gen(function* () {
			const doc = yield* QueryCache.fetch(docQuery(1));
			yield* QueryCache.invalidate(["doc"]);
			return doc;
		});
		function useTypeOnly() {
			const run = DocBoundary.useRun();
			expectTypeOf(run(rename)).toEqualTypeOf<
				Promise<Result.Result<Doc, NotFound>>
			>();
		}
		expectTypeOf(useTypeOnly).toBeFunction();
	});
});
