import { loaderVerbOf } from "@examples/kit/lib/loader-verb";

import { page } from "$app/state";

/** An in-app path under the current URL's loader verb (`/issues/3` → `/ensure/issues/3`). */
export function verbHref(path: string) {
	return `/${loaderVerbOf(page.url.pathname)}${path}`;
}
