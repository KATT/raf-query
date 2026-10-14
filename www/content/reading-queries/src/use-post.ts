import {
	type EnsuredQueryHandle,
	type QueryHandle,
	type UseQueryOptions,
	useQuery,
} from "@raf-query/react";

import { postQuery } from "./queries";

const factory = postQuery;

export function usePost(
	handle: QueryHandle<typeof postQuery>,
	ensuredHandle: EnsuredQueryHandle<typeof postQuery>,
	options?: UseQueryOptions,
) {
	// #region signature
	{
		const [promise, controls] = useQuery(factory, handle, options);
		// #endregion
		void promise;
		void controls;
	}
	{
		// #region signature
		const [data, controls] = useQuery(factory, ensuredHandle, options);
		// #endregion
		void data;
		void controls;
	}
}
