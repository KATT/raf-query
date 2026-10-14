import { QueryClient, type QueryClientConfig } from "@raf-query/react";

declare const config: QueryClientConfig | undefined;

// #region query-client
export const queryClient = new QueryClient(config);
// #endregion
