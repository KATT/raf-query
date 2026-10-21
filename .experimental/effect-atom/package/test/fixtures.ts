import { Context, Effect, Layer, Schema } from "effect";
import { Atom } from "effect/reactivity";

export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
	"Unauthorized",
	{},
) {}

export class Forbidden extends Schema.TaggedError<Forbidden>()("Forbidden", {
	id: Schema.Number,
}) {}

export class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
	id: Schema.Number,
}) {}

export interface Doc {
	readonly id: number;
	readonly title: string;
}

/** What `Docs.get` does for each id; tests change it between reads. */
export type Behavior = "ok" | "unauthorized" | "forbidden" | "missing" | "die";

type DocError = Unauthorized | Forbidden | NotFound;

class Docs extends Context.Service<
	Docs,
	{ readonly get: (id: number) => Effect.Effect<Doc, DocError> }
>()("test/Docs") {}

const answer = (
	behavior: Behavior,
	id: number,
): Effect.Effect<Doc, DocError> => {
	switch (behavior) {
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
};

/**
 * A runtime whose `Docs` answers as `state.behavior` says, after
 * `state.latency` milliseconds, with atoms over
 * it. `docAtom` is kept alive and refreshed by the `"docs"` reactivity key,
 * like an `AtomRpc` query with a `timeToLive`.
 */
export const makeDocs = (initial: Behavior) => {
	const state = { behavior: initial, calls: 0, latency: 0 };
	const runtime = Atom.runtime(
		Layer.succeed(Docs, {
			get: (id) =>
				Effect.suspend(() => {
					state.calls++;
					const behavior = state.behavior;
					return Effect.andThen(
						Effect.sleep(state.latency),
						answer(behavior, id),
					);
				}),
		}),
	);
	const docAtom = Atom.family((id: number) =>
		runtime
			.atom(Effect.flatMap(Docs, (docs) => docs.get(id)))
			.pipe(runtime.factory.withReactivity(["docs"]), Atom.keepAlive),
	);
	const rename = runtime.fn((id: number) =>
		Effect.flatMap(Docs, (docs) => docs.get(id)),
	);
	return { docAtom, rename, runtime, state };
};
