import { createQueryClient, retry } from "@raf-query/react";

/**
 * The site's query client. Pages and demo code only change with a deploy:
 * nothing to refetch on focus, and no actions to invalidate after.
 */
export function makeQueryClient() {
	return createQueryClient({ plugins: [retry()] });
}
