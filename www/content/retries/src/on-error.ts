/* oxlint-disable anti-slop/no-unknown-parameters -- sample error reporter */
import { QueryClient } from "@raf-query/react";

function reportError(error: unknown, context: { readonly key: unknown }): void {
	void error;
	void context;
}

// #region on-error
const queryClient = new QueryClient({
	onError: (error, query) => {
		reportError(error, { key: query.key });
	},
});
// #endregion

export { queryClient };
