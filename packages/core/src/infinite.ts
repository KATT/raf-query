import type { Operation } from "./client.ts";
import { type Fail, isFailValue } from "./fail.ts";
import type { QueryKeyOption } from "./keys.ts";
import type {
	BaseOptions,
	QueryFunctionContext,
	QueryOptions,
} from "./options.ts";

/** A paged query's data. */
export interface InfiniteData<TPage, TParam = unknown> {
	readonly pageParams: ReadonlyArray<TParam>;
	readonly pages: ReadonlyArray<TPage>;
}

export interface InfiniteQueryFunctionContext<
	TKey extends QueryKeyOption,
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

export interface InfiniteOptions<
	TKey extends QueryKeyOption,
	TPage,
	TParam,
	TData,
> extends BaseOptions<TKey, InfiniteData<TPage, TParam>> {
	readonly getNextPageParam: PageParamFn<TPage, TParam>;
	readonly getPreviousPageParam?: PageParamFn<TPage, TParam>;
	readonly initialPageParam: TParam;
	/** Keep at most this many pages, dropping from the other end. */
	readonly maxPages?: number;
	readonly select?: (data: InfiniteData<TPage, TParam>) => TData;
}

/** What `infiniteQueryOptions` returns. */
export type InfiniteQueryOptions<
	TKey extends QueryKeyOption = QueryKeyOption,
	TPage = unknown,
	TParam = unknown,
	TFail = unknown,
	TData = InfiniteData<TPage, TParam>,
> = QueryOptions<TKey, InfiniteData<TPage, TParam>, TFail, TData> &
	Pick<
		InfiniteOptions<TKey, TPage, TParam, TData>,
		| "getNextPageParam"
		| "getPreviousPageParam"
		| "initialPageParam"
		| "maxPages"
	> & { readonly "~run": (op: Operation) => Promise<unknown> };

/**
 * Typed options for a paged query factory. Readers get `{ pages, pageParams }`
 * and controls to fetch the next or previous page:
 *
 * ```ts
 * export const issueList = (input: { status: Status }) =>
 *   infiniteQueryOptions({
 *     queryKey: [issues, "list", input],
 *     queryFn: ({ pageParam, signal }) => listIssues({ ...input, cursor: pageParam }, { signal }),
 *     initialPageParam: 0,
 *     getNextPageParam: (lastPage) => lastPage.nextCursor,
 *   });
 * ```
 */
export function infiniteQueryOptions<
	const TKey extends QueryKeyOption,
	TResult,
	TParam,
	TData = InfiniteData<Exclude<TResult, Fail>, TParam>,
>(
	options: InfiniteOptions<TKey, Exclude<TResult, Fail>, TParam, TData> & {
		readonly queryFn: (
			context: InfiniteQueryFunctionContext<TKey, TParam>,
		) => PromiseLike<TResult> | TResult;
	},
): InfiniteQueryOptions<
	TKey,
	Exclude<TResult, Fail>,
	TParam,
	Extract<TResult, Fail>,
	TData
> {
	return {
		...options,
		"~run": (op) =>
			runPages(
				op,
				// SAFETY: the page types only narrow what `runPages` passes through.
				options as unknown as PagedSource,
			),
	};
}

interface PagedSource {
	readonly getNextPageParam: PageParamFn<unknown, unknown>;
	readonly getPreviousPageParam?: PageParamFn<unknown, unknown>;
	readonly initialPageParam: unknown;
	readonly maxPages?: number;
	readonly queryFn: (
		context: InfiniteQueryFunctionContext<QueryKeyOption, unknown>,
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

async function runPages(op: Operation, source: PagedSource): Promise<unknown> {
	const fetchPage = (pageParam: unknown, direction: "backward" | "forward") =>
		Promise.resolve(
			source.queryFn({
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
		if (isFailValue(page)) {
			return page;
		}
		const max = source.maxPages ?? Infinity;
		return direction === "next"
			? {
					pageParams: [...previous.pageParams, pageParam].slice(-max),
					pages: [...previous.pages, page].slice(-max),
				}
			: {
					pageParams: [pageParam, ...previous.pageParams].slice(0, max),
					pages: [page, ...previous.pages].slice(0, max),
				};
	}
	const count = previous?.pages.length ?? op.pages ?? 1;
	const pages: Array<unknown> = [];
	const pageParams: Array<unknown> = [];
	let pageParam = previous?.pageParams[0] ?? source.initialPageParam;
	while (pages.length < count) {
		const page = await fetchPage(pageParam, "forward");
		if (isFailValue(page)) {
			return page;
		}
		pages.push(page);
		pageParams.push(pageParam);
		const next = pageParamAfter(source, { pageParams, pages }, "next");
		if (next === undefined) {
			break;
		}
		pageParam = next;
	}
	return { pageParams, pages };
}
