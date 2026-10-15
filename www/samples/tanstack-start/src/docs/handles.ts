import type {
	EnsuredQueryHandle,
	InputOf,
	QueryHandle,
	QueryKey,
} from "@raf-query/react";
import { postQuery } from "~/queries.ts";

// #region intro
type Handle = QueryHandle<typeof postQuery>;
//   ^?
// { key: QueryKey; input: { slug: string }; ensured: false }

type Ensured = EnsuredQueryHandle<typeof postQuery>;
//   ^?
// { key: QueryKey; input: { slug: string }; ensured: true }

type PostInput = InputOf<typeof postQuery>; // { slug: string }
type PostKey = QueryKey; // readonly unknown[]
// #endregion
