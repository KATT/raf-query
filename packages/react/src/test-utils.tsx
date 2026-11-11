import { act, render, type RenderResult } from "@testing-library/react";
import { type ReactNode, Suspense } from "react";

import {
	bindInfiniteQueryOptions,
	bindQueryOptions,
	createQueryClient,
	group,
	type QueryClient,
	type QueryClientConfig,
	QueryClientProvider,
} from "./index.ts";

/** The builders of factories that need no plugin: they run on any client. */
export const queryOptions = bindQueryOptions();
const infiniteQueryOptions = bindInfiniteQueryOptions();

export interface Issue {
	readonly id: number;
	readonly title: string;
}

/** What the backend's issue query throws for an issue it doesn't have. */
class NotFoundError extends Error {
	readonly id: number;
	constructor(id: number) {
		super(`Issue ${id} not found`);
		this.id = id;
	}
}

interface Request {
	fail(error: unknown): void;
	readonly id: number;
	respond(): void;
}

export const issues = group("issues");

/** A backend whose requests settle when the test says so. */
export function createBackend() {
	const store = new Map<number, Issue>([
		[1, { id: 1, title: "First" }],
		[2, { id: 2, title: "Second" }],
	]);
	const requests: Array<Request> = [];

	function get(id: number) {
		const deferred = Promise.withResolvers<Issue | undefined>();
		requests.push({
			fail: deferred.reject,
			id,
			respond: () => deferred.resolve(store.get(id)),
		});
		return deferred.promise;
	}

	const issueQuery = (input: { readonly id: number }) =>
		queryOptions({
			queryFn: async () => {
				const issue = await get(input.id);
				if (!issue) {
					throw new NotFoundError(input.id);
				}
				return issue;
			},
			queryKey: issues("byId", input),
		});

	const titleQuery = (input: { readonly id: number }) =>
		queryOptions({
			queryFn: async () => (await get(input.id))?.title ?? "",
			queryKey: issues("title", input),
			select: (title: string) => title.toUpperCase(),
		});

	const pageQuery = (input: { readonly size: number }) =>
		infiniteQueryOptions({
			getNextPageParam: (page: ReadonlyArray<number>) => {
				const last = Math.max(...page);
				return last < 3 ? last + 1 : undefined;
			},
			getPreviousPageParam: (page: ReadonlyArray<number>) => {
				const first = Math.min(...page);
				return first > 0 ? first - 1 : undefined;
			},
			initialPageParam: 1,
			queryFn: async (context) => {
				await get(context.pageParam);
				return Array.from({ length: input.size }, () => context.pageParam);
			},
			queryKey: issues("pages", input),
		});

	return {
		issueQuery,
		pageQuery,
		requests,
		/** Settle every open request. */
		async respondAll() {
			await act(async () => {
				for (const request of requests.splice(0)) {
					request.respond();
				}
				await flush();
			});
		},
		store,
		titleQuery,
	};
}

/** Let queued microtasks and promise callbacks run. */
export function flush() {
	return new Promise<void>((resolve) => {
		setTimeout(resolve, 0);
	});
}

/** A browser-side test client. */
export function testClient(config: QueryClientConfig = {}): QueryClient {
	return createQueryClient({ isServer: false, ...config });
}

/** Render `ui` under a provider and a Suspense boundary that shows "loading". */
export async function renderWith(
	client: QueryClient,
	ui: ReactNode,
): Promise<RenderResult & { rerender(next: ReactNode): Promise<void> }> {
	const wrap = (children: ReactNode) => (
		<QueryClientProvider client={client}>
			<Suspense fallback="loading">{children}</Suspense>
		</QueryClientProvider>
	);
	let result!: RenderResult;
	await act(async () => {
		result = render(wrap(ui));
	});
	return {
		...result,
		rerender: async (next: ReactNode) => {
			await act(async () => {
				result.rerender(wrap(next));
			});
		},
	};
}
