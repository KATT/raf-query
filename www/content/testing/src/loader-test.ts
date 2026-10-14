import { QueryClient } from "@raf-query/react";
import { expect, test } from "vitest";

import { commentsQuery, postQuery } from "./queries";
import { postSlugLoader } from "./routes/posts.$slug";

const queryClient = new QueryClient();

// #region loader
test("the post loader starts both queries", async () => {
	await postSlugLoader({
		context: { queryClient },
		params: { slug: "hello" },
	});
	expect(queryClient.getData(postQuery, { slug: "hello" })).toBeDefined();
	expect(queryClient.isFetching({ queryKey: ["comments"] })).toBe(1);
});
// #endregion

void commentsQuery;
