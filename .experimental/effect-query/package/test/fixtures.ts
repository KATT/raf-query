import { Context, Effect, Layer, Schema } from "effect";

import { Query } from "../src/index.ts";

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

export class Docs extends Context.Service<
	Docs,
	{
		readonly calls: () => number;
		readonly get: (
			id: number,
		) => Effect.Effect<Doc, Unauthorized | Forbidden | NotFound>;
	}
>()("test/Docs") {}

export const docsLayer = (behavior: (id: number) => Behavior) =>
	Layer.sync(Docs, () => {
		let calls = 0;
		return {
			calls: () => calls,
			get: (id: number) =>
				Effect.suspend(
					(): Effect.Effect<Doc, Unauthorized | Forbidden | NotFound> => {
						calls++;
						switch (behavior(id)) {
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
					},
				),
		};
	});

export const docQuery = (id: number) =>
	Query.make({
		effect: Effect.flatMap(Docs, (docs) => docs.get(id)),
		key: ["doc", id],
	});
