import { QueryClient } from "@raf-query/react";

// #region defaults
const queryClient = new QueryClient({
	defaults: {
		refetchOnReconnect: false,
		refetchOnWindowFocus: false,
	},
});
// #endregion

export { queryClient };
