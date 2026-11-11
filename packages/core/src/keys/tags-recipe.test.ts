/**
 * Tags aren't part of core: they're a recipe an app writes with two public
 * pieces, the same as the docs show (`www/content/query-invalidation.md#tags`).
 *
 * - `plugin<{ options: … }>()` without a link or a setup function does
 *   nothing at runtime. It only declares the `tags` option, so a client
 *   that has it, and the builders bound to that client, type the field.
 * - A target is any object with `where(query, param)`. A verb calls it for
 *   each cached query with the query's options, and invalidates, resets or
 *   removes the ones it returns `true` for. Typed against the declared
 *   field, a tag target fits only the clients that declare it.
 */
import { describe, expect, expectTypeOf, it } from "vitest";

import {
	bindQueryOptions,
	createQueryClient,
	invalidateMany,
	plugin,
	retry,
	type Target,
	waterfallHandle,
} from "../index.ts";
import type { RootOf } from "../root.ts";
import { flush, issues, read, testClient } from "../test-utils.ts";

interface Tags {
	readonly options: { readonly tags?: ReadonlyArray<string> };
}
const tagged = plugin<Tags>();

type Tagged = { readonly tags: ReadonlyArray<string> | undefined };

const tag = (name: string): Target<Tagged> => ({
	where: (query) => query.options.tags?.includes(name) ?? false,
});

const withTag: Target<Tagged, string> = {
	where: (query, name) => query.options.tags?.includes(name) ?? false,
};

const makeQueryClient = () => createQueryClient({ plugins: [tagged] });
const queryOptions = bindQueryOptions<typeof makeQueryClient>();

function counted(name: string, tags?: ReadonlyArray<string>) {
	let calls = 0;
	const query = () =>
		queryOptions({
			queryFn: () => (calls += 1),
			queryKey: issues(name),
			tags,
		});
	return { calls: () => calls, query };
}

describe("tags written in user code", () => {
	it("refetch the read queries that list the tag, and leave the rest", async () => {
		const client = testClient({ plugins: [tagged] });
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

	it("type tags only on a client that has the plugin", () => {
		expectTypeOf<RootOf<typeof makeQueryClient>["options"]>().toEqualTypeOf<{
			readonly tags: ReadonlyArray<string> | undefined;
		}>();
		const bare = () => createQueryClient({ plugins: [retry()] });
		const bareQueryOptions = bindQueryOptions<typeof bare>();
		const wrong = () => {
			bareQueryOptions({
				queryFn: () => 1,
				queryKey: issues("bare"),
				// @ts-expect-error -- nothing in this root declares `tags`
				tags: ["post"],
			});
			queryOptions({
				queryFn: () => 1,
				queryKey: issues("numbers"),
				// @ts-expect-error -- tags are strings
				tags: [1],
			});
			// @ts-expect-error -- a tag reads `tags`, which this root doesn't declare
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
