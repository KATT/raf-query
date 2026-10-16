import { loaderVerbOf } from "@examples/kit/lib/loader-verb";
import { useRoute } from "vue-router";

/**
 * In-app paths under the current URL's loader verb
 * (`/issues/3` → `/ensure/issues/3`). Call it in `setup`.
 */
export function useVerbHref() {
	const route = useRoute();
	return (path: string) => `/${loaderVerbOf(route.path)}${path}`;
}
