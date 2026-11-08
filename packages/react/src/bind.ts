import type { QueryClient } from "@raf-query/core";
import type { RootOf } from "@raf-query/core/internal";

import { useQueryClient } from "./provider.tsx";

/**
 * `useQueryClient` typed with a root, so verbs called with the client it
 * returns check factories and targets against that root. `T` is the
 * client's type, or the type of a function that makes it. Bind once per app:
 *
 * ```ts
 * // raf.ts
 * export const useQueryClient = bindUseQueryClient<typeof makeQueryClient>();
 * ```
 *
 * It returns `useQueryClient` itself; only the types change. It isn't a
 * hook, so call it at module level. This module has no `"use client"`, so a
 * server module can import the file that binds it.
 *
 * @see https://raf-query.katt.dev/docs/query-meta#typing-meta-by-its-root
 */
export function bindUseQueryClient<T>(): () => QueryClient<RootOf<T>> {
	return useQueryClient;
}
