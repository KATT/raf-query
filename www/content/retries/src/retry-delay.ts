import { queryOptions } from "@raf-query/react";

import { getPost } from "./api";

export function retryDelayExamples() {
	// #region delay
	queryOptions({
		queryKey: ["post", "hello"],
		queryFn: () => getPost("hello"),
		// Constant
		retryDelay: 1000,
	});

	queryOptions({
		queryKey: ["post", "hello"],
		queryFn: () => getPost("hello"),
		// Exponential with a ceiling, the default's shape
		retryDelay: (failureCount) =>
			Math.min(1000 * 2 ** (failureCount - 1), 30_000),
	});
	// #endregion
}
