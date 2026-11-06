import {
	createQueryClient,
	link,
	queryOptions,
	recommended,
	retry,
	timeout,
} from "@raf-query/react";
import { isRedirect } from "@tanstack/react-router";
import { getPost, HttpError } from "~/api.ts";
import { posts } from "~/queries.ts";

// #region intro
const queryClient = createQueryClient({ links: [retry()] });
// or
const withEverything = createQueryClient({ ...recommended() });
// #endregion

// #region attempts-per-query
export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: [posts, "bySlug", input.slug],
		queryFn: () => getPost(input.slug),
		meta: { retry: 5 }, // or `false`
	});
}
// #endregion

// #region options
const patient = createQueryClient({
	links: [
		retry({
			attempts: 5,
			delay: (attempt) => 500 * (attempt + 1),
			when: (error) => !(error instanceof HttpError && error.status === 404),
		}),
	],
});
// #endregion

// #region timeouts
// Each attempt gets 10 seconds.
const perAttempt = createQueryClient({ links: [retry(), timeout(10_000)] });

// The request and all its retries get 30 seconds.
const overall = createQueryClient({ links: [timeout(30_000), retry()] });
// #endregion

declare function showToast(message: string): void;

declare function reportError(
	error: unknown,
	context: { readonly queryKey: unknown },
): void;

// #region one-place-for-every-error
const reportErrors = link<{ meta: { errorMessage?: string } }>(
	async (op, next) => {
		try {
			return await next(op);
		} catch (error) {
			if (!op.signal.aborted) {
				reportError(error, { queryKey: op.queryKey });
				showToast(op.meta.errorMessage ?? "Something went wrong");
			}
			throw error;
		}
	},
);

const reporting = createQueryClient({ links: [reportErrors, retry()] });
// #endregion

// #region redirects
const withRedirects = createQueryClient({
	links: [retry({ when: (error) => !isRedirect(error) })],
});
// #endregion
