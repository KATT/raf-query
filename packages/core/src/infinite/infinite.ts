import type { Operation } from "../client.ts";
import { hashKey, type QueryKey } from "../keys/keys.ts";
import type {
	BaseOptions,
	FromQueryFn,
	QueryFunctionContext,
	QueryOptions,
} from "../options.ts";
import type { DefaultTypes, RootOf, RootTypes } from "../root.ts";

/**
 * A paged query's data.
 *
 * @see https://raf-query.katt.dev/docs/infinite-queries
 */
export interface InfiniteData<TPage, TParam = unknown> {
	readonly pageParams: ReadonlyArray<TParam>;
	readonly pages: ReadonlyArray<TPage>;
}

/**
 * What a paged `queryFn` gets: the query function context, plus the page param and the direction it loads in.
 *
 * @see https://raf-query.katt.dev/docs/infinite-queries
 */
export interface InfiniteQueryFunctionContext<
	TKey extends QueryKey,
	TParam,
> extends QueryFunctionContext<TKey> {
	readonly direction: "backward" | "forward";
	readonly pageParam: TParam;
}

type PageParamFn<TPage, TParam> = (
	page: TPage,
	pages: ReadonlyArray<TPage>,
	pageParam: TParam,
) => TParam | null | undefined;

interface InfiniteOptions<
	TKey extends QueryKey,
	TPage,
	TParam,
	TData,
	TTypes extends RootTypes = RootTypes,
> extends BaseOptions<TKey, TTypes> {
	readonly getNextPageParam: PageParamFn<TPage, TParam>;
	readonly getPreviousPageParam?: PageParamFn<TPage, TParam>;
	readonly initialPageParam: TParam;
	/**
	 * Whether the cached pages suit this input. Pages grow from the
	 * `initialPageParam` the entry was first loaded with; when part of the
	 * input picks only that start and stays out of the key (the item a list
	 * opens at), inputs that differ there share one entry. `load` asks
	 * before it uses the pages: on `false` it drops them, and the list loads
	 * again from this input's `initialPageParam`. Readers never drop pages.
	 * Default: keep them.
	 */
	readonly keepPages?: (data: InfiniteData<TPage, TParam>) => boolean;
	/** Keep at most this many pages, dropping from the other end. */
	readonly maxPages?: number;
	readonly select?: (data: InfiniteData<TPage, TParam>) => TData;
}

/**
 * What `infiniteQueryOptions` returns.
 *
 * @see https://raf-query.katt.dev/docs/infinite-queries
 */
export type InfiniteQueryOptions<
	TKey extends QueryKey = QueryKey,
	TPage = unknown,
	TParam = unknown,
	TData = InfiniteData<TPage, TParam>,
	TTypes extends RootTypes = RootTypes,
> = QueryOptions<TKey, InfiniteData<TPage, TParam>, TData, TTypes> &
	Pick<
		InfiniteOptions<TKey, TPage, TParam, TData, TTypes>,
		| "getNextPageParam"
		| "getPreviousPageParam"
		| "initialPageParam"
		| "maxPages"
	> & { readonly "~run": (op: Operation) => Promise<unknown> };

/**
 * `infiniteQueryOptions`, with `meta` checked against the root `TTypes`.
 *
 * @see https://raf-query.katt.dev/docs/links-and-features#typing-meta-by-its-root
 */
export interface InfiniteQueryOptionsBuilder<TTypes extends RootTypes> {
	<
		const TKey extends QueryKey,
		TPage,
		TParam,
		TData = InfiniteData<TPage, TParam>,
	>(
		options: InfiniteOptions<
			TKey,
			FromQueryFn<TPage>,
			TParam,
			TData,
			TTypes
		> & {
			readonly queryFn: (
				context: InfiniteQueryFunctionContext<TKey, TParam>,
			) => PromiseLike<TPage> | TPage;
		},
	): InfiniteQueryOptions<TKey, TPage, TParam, TData, TTypes>;
}

/**
 * Typed options for a paged query factory. Readers get `{ pages, pageParams }`
 * and, on their state, `fetchNextPage` and `fetchPreviousPage`:
 *
 * ```ts
 * export const commentsQuery = (input: { slug: string }) =>
 *   infiniteQueryOptions({
 *     queryKey: comments(input.slug),
 *     queryFn: ({ pageParam, signal }) => listComments({ ...input, cursor: pageParam }, { signal }),
 *     initialPageParam: 0,
 *     getNextPageParam: (lastPage) => lastPage.nextCursor,
 *   });
 * ```
 *
 * Its `meta` is any record. To check `meta` against a client's links and
 * features, use the builder {@link bindInfiniteQueryOptions} returns.
 *
 * @see https://raf-query.katt.dev/docs/infinite-queries
 */
export const infiniteQueryOptions: InfiniteQueryOptionsBuilder<DefaultTypes> = (
	options,
) => ({
	...options,
	"~keep": options.keepPages,
	"~run": (op) =>
		runPages(
			op,
			// SAFETY: the page types only narrow what `runPages` passes through.
			options as unknown as PagedSource,
		),
});

/**
 * `infiniteQueryOptions` bound to a root, like `bindQueryOptions`. Bind it
 * next to `queryOptions`, in apps that page:
 *
 * ```ts
 * // raf.ts
 * export const infiniteQueryOptions = bindInfiniteQueryOptions<typeof makeQueryClient>();
 * ```
 *
 * @see https://raf-query.katt.dev/docs/links-and-features#typing-meta-by-its-root
 */
export function bindInfiniteQueryOptions<T>(): InfiniteQueryOptionsBuilder<
	RootOf<T>
> {
	// SAFETY: the root is a phantom; the builder never reads it.
	return infiniteQueryOptions as InfiniteQueryOptionsBuilder<RootOf<T>>;
}

interface PagedSource {
	readonly getNextPageParam: PageParamFn<unknown, unknown>;
	readonly getPreviousPageParam?: PageParamFn<unknown, unknown>;
	readonly initialPageParam: unknown;
	readonly maxPages?: number;
	readonly queryFn: (
		context: InfiniteQueryFunctionContext<QueryKey, unknown>,
	) => unknown;
}

/** The param of the page after (or before) `data`, or `undefined` at the end. */
export function pageParamAfter(
	options: Pick<PagedSource, "getNextPageParam" | "getPreviousPageParam">,
	data: InfiniteData<unknown>,
	direction: "next" | "previous",
): unknown {
	const forward = direction === "next";
	const index = forward ? data.pages.length - 1 : 0;
	const page = data.pages[index];
	const getParam = forward
		? options.getNextPageParam
		: options.getPreviousPageParam;
	if (page === undefined || !getParam) {
		return undefined;
	}
	return getParam(page, data.pages, data.pageParams[index]) ?? undefined;
}

/**
 * The entry's data as it is now, which writes may have changed since `op`
 * started, or `fallback` while it has none.
 */
function latest<TFallback extends InfiniteData<unknown> | undefined>(
	op: Operation,
	fallback: TFallback,
): InfiniteData<unknown> | TFallback {
	const state = op.client["~entries"].get(op.hash)?.state;
	return state?.hasData
		? // SAFETY: a paged entry's data is always `InfiniteData`.
			(state.data as InfiniteData<unknown>)
		: fallback;
}

function sameParam(a: unknown, b: unknown): boolean {
	return hashKey([a]) === hashKey([b]);
}

/** The page `data` holds for `pageParam`, if any. */
function pageFor(data: InfiniteData<unknown> | undefined, pageParam: unknown) {
	const index =
		data?.pageParams.findIndex((param) => sameParam(param, pageParam)) ?? -1;
	return index === -1 ? undefined : data?.pages[index];
}

async function runPages(op: Operation, source: PagedSource): Promise<unknown> {
	const fetchPage = (pageParam: unknown, direction: "backward" | "forward") =>
		Promise.resolve(
			source.queryFn({
				client: op.client,
				direction,
				meta: op.meta,
				pageParam,
				queryKey: op.queryKey,
				signal: op.signal,
			}),
		);
	const previous = op.hasData
		? // SAFETY: a paged entry's data is always `InfiniteData`.
			(op.data as InfiniteData<unknown>)
		: undefined;
	const direction = op.direction;
	if (previous && direction) {
		const pageParam = pageParamAfter(source, previous, direction);
		if (pageParam === undefined) {
			return previous;
		}
		const page = await fetchPage(
			pageParam,
			direction === "next" ? "forward" : "backward",
		);
		// Add the page to the data as it is now, so writes made while it
		// loaded stay. A write that moved the end being loaded wins: the page
		// wouldn't follow the pages it would be added to.
		const current = latest(op, previous);
		const edge = (data: InfiniteData<unknown>) =>
			direction === "next" ? data.pageParams.at(-1) : data.pageParams[0];
		if (!sameParam(edge(current), edge(previous))) {
			return current;
		}
		const max = source.maxPages ?? Infinity;
		return direction === "next"
			? {
					pageParams: [...current.pageParams, pageParam].slice(-max),
					pages: [...current.pages, page].slice(-max),
				}
			: {
					pageParams: [pageParam, ...current.pageParams].slice(0, max),
					pages: [page, ...current.pages].slice(0, max),
				};
	}
	const count = previous?.pages.length ?? op.pages ?? 1;
	const pages: Array<unknown> = [];
	const pageParams: Array<unknown> = [];
	/** The page the entry held for each param when that page's read started. */
	const before: Array<unknown> = [];
	let pageParam = previous?.pageParams[0] ?? source.initialPageParam;
	while (pages.length < count) {
		before.push(pageFor(latest(op, undefined), pageParam));
		const page = await fetchPage(pageParam, "forward");
		pages.push(page);
		pageParams.push(pageParam);
		const next = pageParamAfter(source, { pageParams, pages }, "next");
		if (next === undefined) {
			break;
		}
		pageParam = next;
	}
	// A page written after its read started wins over the read: a live
	// writer sends every later change again, while a dropped write never
	// comes back. One written before its read started was read again.
	const now = latest(op, undefined);
	return {
		pageParams,
		pages: pages.map((page, index) => {
			const written = pageFor(now, pageParams[index]);
			return written !== undefined && written !== before[index]
				? written
				: page;
		}),
	};
}
