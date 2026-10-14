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
		void promise;
		void controls;
	}
	{
		const [data, controls] = useQuery(factory, ensuredHandle, options);
		void data;
		void controls;
	}
	// #endregion
}
