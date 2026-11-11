// #region make-query-client
import { createQueryClient, recommended } from "@raf-query/react";

export function makeQueryClient() {
	return createQueryClient({
		parts: recommended(),
		defaults: { staleTime: 5000 },
	});
}
// #endregion make-query-client

// #region context
import type { QueryClient } from "@raf-query/react";
import { createContext } from "react-router";

export const queryClientContext = createContext<QueryClient>();
// #endregion context
