import { QueryClient } from "@raf-query/react";

// #region is-server
const queryClient = new QueryClient({ isServer: false });
// #endregion

export { queryClient };
