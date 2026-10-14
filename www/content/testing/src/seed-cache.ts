import { QueryClient } from "@raf-query/react";

import { postQuery } from "./queries";

const queryClient = new QueryClient();

export async function seedPost() {
	// #region seed
	queryClient.setData(
		postQuery,
		{ slug: "hello" },
		{ slug: "hello", title: "Hello", body: "", authorId: "" },
	);
	const handle = await queryClient.ensure(postQuery, { slug: "hello" });
	// #endregion
	return handle;
}
