import { describe, expectTypeOf, it } from "@effect/vitest";
import { Context, Effect, Layer, Match, Result, Schema } from "effect";

import {
	Boundary,
	Mutation,
	Query,
	QueryCache,
	QueryClient,
} from "../src/index.ts";
import {
	type Doc,
	type DocError,
	docQuery,
	docsLayer,
	type Forbidden,
	NotFound,
	type Unauthorized,
} from "./fixtures.ts";

const client = QueryClient.make(docsLayer(() => "ok"));
const [App, useApp, useAppResult] = Boundary.root({
	client,
	errors: Boundary.errors<DocError>(),
	fallback: () => null,
	name: "App",
});
const [Auth, useAuth, useAuthResult] = Boundary.catchErrors(App, {
	fallback: () => null,
	name: "Auth",
	tags: ["Unauthorized"],
});
const [DocBoundary, useDoc, useDocResult] = Boundary.catchErrors(Auth, {
	fallback: () => null,
	name: "Doc",
	tags: ["Forbidden"],
});
const [Everything, useEverything, useEverythingResult] = Boundary.catchErrors(
	DocBoundary,
	{
		fallback: () => null,
		name: "All",
		tags: ["NotFound"],
	},
);

class Other extends Context.Service<Other, { readonly name: string }>()(
	"test/Other",
) {}

const needsOther = Query.make({
	effect: Effect.map(Other, (other) => other.name),
	key: ["other"],
});

const [, useWithOther] = Boundary.root({
	client: QueryClient.make(Layer.succeed(Other, { name: "other" })),
	fallback: () => null,
	name: "WithOther",
});

/** Another `Forbidden`: same tag, other fields. */
class OrgForbidden extends Schema.TaggedError<OrgForbidden>()("Forbidden", {
	orgId: Schema.String,
}) {}

describe("Boundary types", () => {
	it("a query's errors are its Effect's", () => {
		expectTypeOf<Query.Error<ReturnType<typeof docQuery>>>().toEqualTypeOf<
			Unauthorized | Forbidden | NotFound
		>();
		const missing = Query.make({
			effect: Effect.fail(new NotFound({ id: 1 })),
			key: ["missing"],
		});
		expectTypeOf<Query.Error<typeof missing>>().toEqualTypeOf<NotFound>();
		const rename = Mutation.make({
			effect: Effect.fail(new NotFound({ id: 1 })),
		});
		expectTypeOf(rename).toEqualTypeOf<Mutation.Mutation<never, NotFound>>();
	});

	it("each boundary's Result hook takes its chain's tags off the failure", () => {
		function useTypeOnly() {
			expectTypeOf(useAppResult(docQuery(1))).toEqualTypeOf<
				Result.Result<Doc, Unauthorized | Forbidden | NotFound>
			>();
			expectTypeOf(useAuthResult(docQuery(1))).toEqualTypeOf<
				Result.Result<Doc, Forbidden | NotFound>
			>();
			expectTypeOf(useDocResult(docQuery(1))).toEqualTypeOf<
				Result.Result<Doc, NotFound>
			>();
			expectTypeOf(useEverythingResult(docQuery(1))).toEqualTypeOf<
				Result.Result<Doc, never>
			>();
		}
		expectTypeOf(useTypeOnly).toBeFunction();
	});

	it("the data hook returns the data, and compiles only when nothing is left", () => {
		function useTypeOnly() {
			expectTypeOf(useEverything(docQuery(1))).toEqualTypeOf<Doc>();
			// @ts-expect-error -- UnhandledErrors: "NotFound"
			useDoc(docQuery(1));
			// @ts-expect-error -- UnhandledErrors: "Forbidden" | "NotFound"
			useAuth(docQuery(1));
			// @ts-expect-error -- UnhandledErrors: "Unauthorized" | "Forbidden" | "NotFound"
			useApp(docQuery(1));
		}
		expectTypeOf(useTypeOnly).toBeFunction();
		expectTypeOf<
			Boundary.Exhausted<DocError, "Unauthorized" | "Forbidden">
		>().toEqualTypeOf<{ readonly UnhandledErrors: "NotFound" }>();
	});

	it("while errors are left, the data is behind the Result", () => {
		function useTypeOnly() {
			const doc = useDocResult(docQuery(1));
			// @ts-expect-error -- NotFound is left, so this is a Result, not a Doc
			expectTypeOf(doc.title).toBeString();
		}
		expectTypeOf(useTypeOnly).toBeFunction();
	});

	it("matching what's left must be exhaustive", () => {
		function useTypeOnly() {
			const result = useAuthResult(docQuery(1));
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

	it("a boundary can't catch a tag one above it already catches", () => {
		Boundary.catchErrors(DocBoundary, {
			fallback: () => null,
			name: "Again",
			// @ts-expect-error -- AlreadyHandledAbove: "Unauthorized"
			tags: ["Unauthorized"],
		});
		Boundary.catchErrors(DocBoundary, {
			fallback: () => null,
			name: "Again",
			// @ts-expect-error -- AlreadyHandledAbove: "Forbidden", listed with a new one
			tags: ["NotFound", "Forbidden"],
		});
		expectTypeOf<
			Boundary.NotYetHandled<"Unauthorized" | "NotFound", "Unauthorized">
		>().toEqualTypeOf<{ readonly AlreadyHandledAbove: "Unauthorized" }>();
	});

	it("tags are the root's errors' tags, and at least one", () => {
		Boundary.catchErrors(Auth, {
			fallback: () => null,
			name: "Typo",
			// @ts-expect-error -- "Forbiden" isn't a tag of the root's errors
			tags: ["Forbiden"],
		});
		Boundary.catchErrors(Auth, {
			fallback: () => null,
			name: "Nothing",
			// @ts-expect-error -- AtLeastOneTag
			tags: [],
		});
		const [Bare] = Boundary.root({
			client,
			fallback: () => null,
			name: "Bare",
		});
		Boundary.catchErrors(Bare, {
			fallback: () => null,
			name: "Auth",
			// @ts-expect-error -- the root declares no errors
			tags: ["Unauthorized"],
		});
		expectTypeOf<Boundary.Catchable<never>>().toEqualTypeOf<
			ReadonlyArray<Boundary.NoUniverse>
		>();
	});

	it("a tag two of the root's errors share can't be caught", () => {
		const [Both] = Boundary.root({
			client,
			errors: Boundary.errors<DocError | OrgForbidden>(),
			fallback: () => null,
			name: "Both",
		});
		Boundary.catchErrors(Both, {
			fallback: () => null,
			name: "Access",
			// @ts-expect-error -- TagSharedByMoreThanOneError: "Forbidden"
			tags: ["Forbidden"],
		});
		Boundary.catchErrors(Both, {
			fallback: (props) => {
				expectTypeOf(props.error).toEqualTypeOf<Unauthorized>();
				return null;
			},
			name: "Auth",
			tags: ["Unauthorized"],
		});
	});

	it("the fallback gets the root's errors with its tags", () => {
		Boundary.catchErrors(Auth, {
			fallback: (props) => {
				expectTypeOf(props.error).toEqualTypeOf<Forbidden | NotFound>();
				expectTypeOf(props.error.id).toBeNumber();
				return null;
			},
			name: "Two",
			tags: ["Forbidden", "NotFound"],
		});
		const OrgFallback = (props: Boundary.FallbackProps<OrgForbidden>) =>
			props.error.orgId;
		Boundary.catchErrors(Auth, {
			// @ts-expect-error -- the error is a Forbidden (id), not an OrgForbidden (orgId)
			fallback: OrgFallback,
			name: "Wrong",
			tags: ["Forbidden"],
		});
	});

	it("a query can't fail with a caught tag under another type", () => {
		const orgQuery = Query.make({
			effect: Effect.fail(new OrgForbidden({ orgId: "o" })),
			key: ["org"],
		});
		function useTypeOnly() {
			// @ts-expect-error -- CaughtAsAnotherType: "Forbidden"
			useDocResult(orgQuery);
			// Through Auth nothing catches "Forbidden", so it's the component's.
			expectTypeOf(useAuthResult(orgQuery)).toEqualTypeOf<
				Result.Result<never, OrgForbidden>
			>();
		}
		expectTypeOf(useTypeOnly).toBeFunction();
	});

	it("errors without a tag, or outside the root's, come back to the component", () => {
		class Plain extends Error {}
		const other = Query.make({
			effect: Effect.fail<Plain | { readonly _tag: "HttpError" } | Forbidden>(
				new Plain(),
			),
			key: ["other"],
		});
		function useTypeOnly() {
			expectTypeOf(useDocResult(other)).toEqualTypeOf<
				Result.Result<never, Plain | { readonly _tag: "HttpError" }>
			>();
		}
		expectTypeOf(useTypeOnly).toBeFunction();
	});

	it("the Provider carries the tags its chain catches", () => {
		expectTypeOf<Boundary.HandledBy<typeof DocBoundary>>().toEqualTypeOf<
			"Unauthorized" | "Forbidden"
		>();
		expectTypeOf<Boundary.HandledBy<typeof App>>().toEqualTypeOf<never>();
		expectTypeOf<
			Boundary.UniverseOf<typeof Everything>
		>().toEqualTypeOf<DocError>();
	});

	it("a query needs only services the root's client provides", () => {
		function useTypeOnly() {
			// @ts-expect-error -- Other is not in the client's layer
			useAppResult(needsOther);
			expectTypeOf(useWithOther(needsOther)).toEqualTypeOf<string>();
		}
		expectTypeOf(useTypeOnly).toBeFunction();
	});

	it("useRun runs mutations that use the cache, and always resolves with a Result", () => {
		const rename = Mutation.make({
			effect: Effect.gen(function* () {
				const doc = yield* QueryCache.fetch(docQuery(1));
				yield* QueryCache.invalidate(["doc"]);
				return doc;
			}),
		});
		function useTypeOnly() {
			const run = Boundary.useRun(DocBoundary);
			expectTypeOf(run(rename)).toEqualTypeOf<
				Promise<Result.Result<Doc, NotFound>>
			>();
			const runAll = Boundary.useRun(Everything);
			expectTypeOf(runAll(rename)).toEqualTypeOf<
				Promise<Result.Result<Doc, never>>
			>();
		}
		expectTypeOf(useTypeOnly).toBeFunction();
	});
});
