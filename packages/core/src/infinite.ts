import type { InfiniteData, InfiniteQueryOptions } from "./options.ts";
import { type Outcome, succeeded } from "./outcome.ts";
import { hasProperty } from "./predicate.ts";

export type Direction = "backward" | "forward";

type Pages = InfiniteData<unknown, unknown>;
type PagedOptions = InfiniteQueryOptions<unknown, unknown, unknown, unknown>;

export function isInfiniteData(data: unknown): data is Pages {
	return (
		hasProperty(data, "pages") &&
		hasProperty(data, "pageParams") &&
		Array.isArray(data.pages) &&
		Array.isArray(data.pageParams)
	);
}

export function nextPageParam(options: PagedOptions, data: Pages) {
	if (data.pages.length === 0) {
		return undefined;
	}
	return options.getNextPageParam(
		data.pages.at(-1),
		data.pages,
		data.pageParams.at(-1),
		data.pageParams,
	);
}

export function previousPageParam(options: PagedOptions, data: Pages) {
	if (data.pages.length === 0 || !options.getPreviousPageParam) {
		return undefined;
	}
	return options.getPreviousPageParam(
		data.pages[0],
		data.pages,
		data.pageParams[0],
		data.pageParams,
	);
}

function addPage(
	data: Pages,
	page: unknown,
	pageParam: unknown,
	direction: Direction,
	maxPages: number | undefined,
): Pages {
	const forward = direction === "forward";
	const pages = forward ? [...data.pages, page] : [page, ...data.pages];
	const pageParams = forward
		? [...data.pageParams, pageParam]
		: [pageParam, ...data.pageParams];
	if (maxPages === undefined || pages.length <= maxPages) {
		return { pageParams, pages };
	}
	return forward
		? { pageParams: pageParams.slice(-maxPages), pages: pages.slice(-maxPages) }
		: {
				pageParams: pageParams.slice(0, maxPages),
				pages: pages.slice(0, maxPages),
			};
}

/**
 * A paged query's request. With a `direction`, adds one page at that end of
 * `current`. Otherwise loads from the first page param again: as many pages
 * as `current` has, or `pages` if that's more, stopping at the last page.
 * The first page that doesn't succeed ends the request with its outcome.
 */
export async function fetchPages(
	options: PagedOptions,
	current: Pages | undefined,
	request: { readonly direction?: Direction; readonly pages?: number },
	fetchPage: (pageParam: unknown, direction: Direction) => Promise<Outcome>,
): Promise<Outcome<Pages>> {
	if (request.direction && current) {
		const pageParam =
			request.direction === "forward"
				? nextPageParam(options, current)
				: previousPageParam(options, current);
		if (pageParam == null) {
			return succeeded(current);
		}
		const page = await fetchPage(pageParam, request.direction);
		if (page.kind !== "success") {
			return page;
		}
		return succeeded(
			addPage(
				current,
				page.value,
				pageParam,
				request.direction,
				options.maxPages,
			),
		);
	}

	const count = Math.max(request.pages ?? 1, current?.pages.length ?? 0);
	let data: Pages = { pageParams: [], pages: [] };
	let pageParam =
		current && current.pageParams.length > 0
			? current.pageParams[0]
			: options.initialPageParam;
	for (let index = 0; index < count; index++) {
		if (index > 0) {
			const next = nextPageParam(options, data);
			if (next == null) {
				break;
			}
			pageParam = next;
		}
		const page = await fetchPage(pageParam, "forward");
		if (page.kind !== "success") {
			return page;
		}
		data = addPage(data, page.value, pageParam, "forward", options.maxPages);
	}
	return succeeded(data);
}
