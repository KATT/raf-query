import {
	createQueryClient,
	part,
	recommended,
	retry,
	timeout,
} from "@raf-query/react";
import { isRedirect } from "@tanstack/react-router";
import { getPost, HttpError } from "~/api.ts";
import { posts } from "~/queries.ts";

// #region intro
const queryClient = createQueryClient({ parts: [retry()] });
// or
const withEverything = createQueryClient({ parts: recommended() });
// #endregion

// #region attempts-per-query
import { queryOptions } from "~/raf.ts";

export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: posts("bySlug", input.slug),
		queryFn: () => getPost(input.slug),
		retry: 5, // or `false`
	});
}
// #endregion

// #region attempts-per-client
const once = createQueryClient({
	parts: recommended(),
	defaults: { retry: 1 },
});
// #endregion

// #region options
const patient = createQueryClient({
	parts: [
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
const perAttempt = createQueryClient({ parts: [retry(), timeout(10_000)] });

// The request and all its retries get 30 seconds.
const overall = createQueryClient({ parts: [timeout(30_000), retry()] });
// #endregion

declare function showToast(message: string): void;

declare function reportError(
	error: unknown,
	context: { readonly queryKey: unknown },
): void;

// #region one-place-for-every-error
interface ErrorReports {
	readonly options: { readonly errorMessage?: string };
}

const reportErrors = part<ErrorReports>({
	link: async (op, next) => {
		try {
			return await next(op);
		} catch (error) {
			if (!op.signal.aborted) {
				reportError(error, { queryKey: op.queryKey });
				showToast(op.options.errorMessage ?? "Something went wrong");
			}
			throw error;
		}
	},
});

const reporting = createQueryClient({ parts: [reportErrors, retry()] });
// #endregion

// #region redirects
const withRedirects = createQueryClient({
	parts: [
		retry({
			when: (error) =>
				!isRedirect(error) &&
				!(error instanceof HttpError && error.status === 404),
		}),
	],
});
// #endregion
