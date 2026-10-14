import { QueryClient } from "@raf-query/react";

// #region defaults
const queryClient = new QueryClient({
	defaults: { retry: 1 },
});
// #endregion

export { queryClient };
