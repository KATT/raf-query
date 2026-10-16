import { queryOptions } from "@raf-query/react";
import { Effect, Schema } from "effect";

export class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
	id: Schema.Number,
}) {}

/** An Effect `queryFn` with a typed error. */
export function nameQuery(input: { id: number }) {
	return queryOptions({
		queryFn: () =>
			input.id === 1
				? Effect.succeed("Ada")
				: Effect.fail(new NotFound({ id: input.id })),
		queryKey: ["name", input.id],
	});
}

/** A promise `queryFn`: its error is `unknown`. */
export function titleQuery(input: { id: number }) {
	return queryOptions({
		queryFn: () => Promise.resolve(`Issue ${input.id}`),
		queryKey: ["title", input.id],
	});
}
