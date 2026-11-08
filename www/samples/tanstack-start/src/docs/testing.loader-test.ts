import { createQueryClient, getData, isFetching } from "@raf-query/react";
import { expect, test } from "./testing.vitest.ts";

import { commentsQuery, postQuery } from "~/queries.ts";

import { postLoader } from "./testing.post-loader.ts";

// #region testing-loaders
test("the post loader starts both queries", async () => {
	const queryClient = createQueryClient({ isServer: false });
	await postLoader({
		context: { queryClient },
		params: { slug: "hello" },
	});
	expect(getData(queryClient, postQuery, { slug: "hello" })).toBeDefined();
	expect(isFetching(queryClient, commentsQuery)).toBe(1);
});
// #endregion
