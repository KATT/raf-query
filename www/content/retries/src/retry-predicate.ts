import { queryOptions } from "@raf-query/react";

import { HttpError, getPost } from "./api";

// #region predicate
const predicateExample = queryOptions({
	queryKey: ["post", "hello"],
	queryFn: () => getPost("hello"),
	retry: (failureCount, error) =>
		failureCount <= 3 && !(error instanceof HttpError && error.status === 404),
});
// #endregion

void predicateExample;
