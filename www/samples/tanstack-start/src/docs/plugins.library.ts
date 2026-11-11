import { createQueryClient, retry } from "@raf-query/react";

// #region library
import {
	bindQueryOptions,
	group,
	type Optional,
	type Plugin,
	plugin,
	type Retry,
} from "@raf-query/react";

export interface CmsClient {
	entry(id: string, init: { signal: AbortSignal }): Promise<{ title: string }>;
}

// What the package's plugin declares: a client for every `queryFn`
export interface Cms {
	readonly context: { readonly cms: CmsClient };
}

export function cms(client: CmsClient): Plugin<Cms> {
	return plugin<Cms>({ context: { cms: client } });
}

// The package's own builder: its factories need `cms()`, and set `retry`
// on the clients that have `retry()`.
const queryOptions = bindQueryOptions<Cms & Optional<Retry>>();

const entries = group("cms");

export function entryQuery(input: { id: string }) {
	return queryOptions({
		queryKey: entries(input.id),
		queryFn: ({ cms, signal }) => cms.entry(input.id, { signal }),
		// The CMS client retries on its own
		retry: false,
	});
}
// #endregion

declare const cmsClient: CmsClient;

// #region app
import { invalidateOne } from "@raf-query/react";

// With `retry()`, which reads the query's `retry: false`
const retrying = createQueryClient({ plugins: [retry(), cms(cmsClient)] });
await invalidateOne(retrying, entryQuery, { id: "home" });

// Without it: the option does nothing
const plain = createQueryClient({ plugins: [cms(cmsClient)] });
await invalidateOne(plain, entryQuery, { id: "home" });

const withoutCms = createQueryClient({ plugins: [retry()] });
// @ts-expect-error -- 2345: this client has no `cms()`
await invalidateOne(withoutCms, entryQuery, { id: "home" });
// #endregion
