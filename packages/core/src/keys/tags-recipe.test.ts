/**
 * Tags aren't part of core: they're a recipe an app writes with two public
 * pieces, the same as the docs show (`www/content/query-invalidation.md#tags`).
 *
 * - `feature<{ meta: … }>()` without a setup function does nothing at
 *   runtime. It only declares `meta.tags`, so a client that has it, and the
 *   builders bound to that client, type the field.
 * - A target is any object with `where(query, param)`. A verb calls it for
 *   each cached query with the query's `meta`, and invalidates, resets or
 *   removes the ones it returns `true` for. Typed against the declared
 *   field, a tag target fits only the clients that declare it.
 */
import { describe, expect, expectTypeOf, it } from "vitest";

import {
	bindQueryOptions,
	createQueryClient,
	feature,
	invalidateMany,
	retry,
	type Target,
	waterfallHandle,
} from "../index.ts";
import type { RootOf } from "../root.ts";
import { flush, issues, read, testClient } from "../test-utils.ts";

const tagged = feature<{ meta: { tags?: ReadonlyArray<string> } }>();

type Tagged = { readonly tags: ReadonlyArray<string> | undefined };

const tag = (name: string): Target<Tagged> => ({
	where: (query) => query.meta.tags?.includes(name) ?? false,
});

const withTag: Target<Tagged, string> = {
	where: (query, name) => query.meta.tags?.includes(name) ?? false,
};

const makeQueryClient = () => createQueryClient({ features: [tagged] });
const queryOptions = bindQueryOptions<typeof makeQueryClient>();

function counted(name: string, tags?: ReadonlyArray<string>) {
	let calls = 0;
	const query = () =>
		queryOptions({
			meta: { tags },
			queryFn: () => (calls += 1),
			queryKey: issues(name),
		});
	return { calls: () => calls, query };
}

describe("tags written in user code", () => {
	it("refetch the read queries that list the tag, and leave the rest", async () => {
		const client = testClient({ features: [tagged] });
		const post = counted("post", ["content", "post"]);
		const page = counted("page", ["content"]);
		const settings = counted("settings");
		for (const one of [post, page, settings]) {
			read(client, one.query, waterfallHandle(one.query));
		}
		await flush();

		await invalidateMany(client, tag("post"));
		expect([post.calls(), page.calls(), settings.calls()]).toEqual([2, 1, 1]);
		await invalidateMany(client, withTag, "content");
		expect([post.calls(), page.calls(), settings.calls()]).toEqual([3, 2, 1]);
	});

	it("type meta.tags only on a client that has the feature", () => {
		expectTypeOf<RootOf<typeof makeQueryClient>>().toEqualTypeOf<{
			readonly meta: { readonly tags: ReadonlyArray<string> | undefined };
		}>();
		const bare = () => createQueryClient({ links: [retry()] });
		const bareQueryOptions = bindQueryOptions<typeof bare>();
		const wrong = () => {
			bareQueryOptions({
				// @ts-expect-error -- nothing in this root declares `meta.tags`
				meta: { tags: ["post"] },
				queryFn: () => 1,
				queryKey: issues("bare"),
			});
			queryOptions({
				// @ts-expect-error -- tags are strings
				meta: { tags: [1] },
				queryFn: () => 1,
				queryKey: issues("numbers"),
			});
			// @ts-expect-error -- a tag reads `meta.tags`, which this root doesn't declare
			void invalidateMany(bare(), tag("post"));
			// @ts-expect-error -- in a list too
			void invalidateMany(bare(), [[withTag, "post"]]);
			// @ts-expect-error -- the parameter is a tag name
			void invalidateMany(makeQueryClient(), withTag, 1);
		};
		expectTypeOf(wrong).toBeFunction();
		void invalidateMany(makeQueryClient(), [tag("post"), [withTag, "page"]]);
	});
});
