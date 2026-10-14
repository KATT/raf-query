import type { DataOf, InputOf, QueryHandle } from "@raf-query/react";

import { postQuery } from "./queries";

// #region types
type PostData = DataOf<typeof postQuery>; // what queryFn resolves to
//   ^?
type PostInput = InputOf<typeof postQuery>;
//   ^?
type PostHandle = QueryHandle<typeof postQuery>; // for props
// #endregion

export type { PostData, PostHandle, PostInput };
