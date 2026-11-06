import type { DefinedQueryHandle, QueryHandle } from "@raf-query/react";
import { postQuery } from "~/queries.ts";

declare const handle: QueryHandle<typeof postQuery>;

// #region intro
type Handle = QueryHandle<typeof postQuery>;
// { queryKey: readonly [Group, "bySlug", string]; input: { slug: string } }

type Defined = DefinedQueryHandle<typeof postQuery>;
// the same, plus `defined: true`

handle.queryKey;
//     ^?
handle.input;
//     ^?
// #endregion
