/* oxlint-disable react-hooks/rules-of-hooks -- api reference sample */
import {
	type EnsuredQueryHandle,
	type QueryHandle,
	useQuery,
} from "@raf-query/react";

import { postQuery } from "./queries";

declare const factory: typeof postQuery;
declare const handle: QueryHandle<typeof postQuery>;
declare const ensuredHandle: EnsuredQueryHandle<typeof postQuery>;
declare const options:
	| {
			readonly refetchInterval?: number;
			readonly refetchOnReconnect?: boolean;
			readonly refetchOnWindowFocus?: boolean;
			readonly whilePending?: "previous" | "suspend";
	  }
	| undefined;

// #region use-query
const [promise, controls] = useQuery(factory, handle, options);
const [data, ensuredControls] = useQuery(factory, ensuredHandle, options);
// #endregion

export { controls, data, ensuredControls, promise };
