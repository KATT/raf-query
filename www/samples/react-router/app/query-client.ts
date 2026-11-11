// #region make-query-client
import { createQueryClient, recommended } from "@raf-query/react";

export function makeQueryClient() {
	return createQueryClient({
		plugins: recommended(),
		defaults: { staleTime: 5000 },
	});
}
// #endregion make-query-client

// #region context
import { createContext } from "react-router";

// The app's client: loaders run the app's factories on it.
export const queryClientContext =
	createContext<ReturnType<typeof makeQueryClient>>();
// #endregion context
