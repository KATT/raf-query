import {
	DEFAULT_LOADER_VERB,
	LoaderVerb,
	loaderVerbs,
} from "@examples/db/types";
import { Option, Schema } from "effect";
import type { QueryClient } from "@raf-query/experimental-vue";
import { type InjectionKey, inject, type Ref, ref } from "vue";
import {
	createMemoryHistory,
	createRouter,
	createWebHistory,
	type RouteLocationNormalized,
	type RouteLocationRaw,
	type Router,
} from "vue-router";

import { issueLoader, issuesLoader, type Loader, notFound } from "./loaders.ts";
import IssueDetailPage from "./pages/IssueDetailPage.vue";
import IssuesPage from "./pages/IssuesPage.vue";
import NotFoundPage from "./pages/NotFoundPage.vue";

declare module "vue-router" {
	interface RouteMeta {
		/** Starts the route's queries before it renders. */
		loader?: Loader;
		/** What `loader` returned for this location; the page's props. */
		loaderData?: unknown;
	}
}

/** What the server's render loaded for the first URL, so the browser doesn't load it again. */
export interface InitialLoad {
	readonly data: unknown;
	readonly fullPath: string;
}

const verb = `:verb(${loaderVerbs.join("|")})`;

function verbOf(to: RouteLocationNormalized): LoaderVerb {
	return LoaderVerb.safeParse(to.params["verb"]).data ?? DEFAULT_LOADER_VERB;
}

/** The not-found page, keeping the URL. */
function notFoundAt(to: RouteLocationNormalized): RouteLocationRaw {
	return {
		hash: to.hash,
		name: "not-found",
		params: { pathMatch: to.path.slice(1).split("/") },
		query: to.query,
	};
}

export const navigatingKey: InjectionKey<Ref<boolean>> = Symbol("navigating");

/** True while a navigation waits on its loader. */
export function useNavigating(): Ref<boolean> {
	const navigating = inject(navigatingKey);
	if (!navigating) {
		throw new Error("useNavigating needs the app's router");
	}
	return navigating;
}

export function createAppRouter(
	queryClient: QueryClient,
	initial: InitialLoad | undefined,
) {
	const router = createRouter({
		history: import.meta.env.SSR ? createMemoryHistory() : createWebHistory(),
		routes: [
			{ path: "/", redirect: `/${DEFAULT_LOADER_VERB}/issues` },
			{
				path: "/issues/:rest(.*)*",
				redirect: (to) => ({
					hash: to.hash,
					path: `/${DEFAULT_LOADER_VERB}${to.path}`,
					query: to.query,
				}),
			},
			{
				component: IssuesPage,
				meta: { loader: issuesLoader },
				path: `/${verb}/issues`,
				props: (to) => ({ data: to.meta.loaderData }),
			},
			{
				component: IssueDetailPage,
				meta: { loader: issueLoader },
				path: `/${verb}/issues/:issueId`,
				props: (to) => ({ data: to.meta.loaderData }),
			},
			{ component: NotFoundPage, name: "not-found", path: "/:pathMatch(.*)*" },
		],
	});
	let pending = initial;
	router.beforeResolve(async (to) => {
		const first = pending;
		pending = undefined;
		const loader = to.meta.loader;
		if (!loader) {
			return;
		}
		if (first?.fullPath === to.fullPath) {
			to.meta.loaderData = first.data;
			return;
		}
		const data = await loader(queryClient, to, verbOf(to));
		if (data === notFound) {
			return notFoundAt(to);
		}
		to.meta.loaderData = data;
	});
	const navigating = ref(false);
	router.beforeEach(() => {
		navigating.value = true;
	});
	// The browser restores the scroll position on back and forward. A new
	// page (a push, which moves Vue Router's history position up) starts at
	// the top.
	let position = import.meta.env.SSR ? undefined : historyPosition();
	router.afterEach((to, from, failure) => {
		navigating.value = false;
		if (import.meta.env.SSR || failure) {
			return;
		}
		const next = historyPosition();
		if (
			next !== undefined &&
			position !== undefined &&
			next > position &&
			to.path !== from.path
		) {
			window.scrollTo(0, 0);
		}
		position = next;
	});
	router.onError(() => {
		navigating.value = false;
	});
	return { navigating, router };
}

const HistoryState = Schema.Struct({ position: Schema.Number });
const decodeHistoryState = Schema.decodeUnknownOption(HistoryState);

function historyPosition() {
	return Option.getOrUndefined(decodeHistoryState(history.state))?.position;
}

/** Start the queries of the page at `href`, for link prefetching. */
export function prefetchPage(
	router: Router,
	queryClient: QueryClient,
	href: string,
) {
	const to = router.resolve(href);
	void Promise.resolve(to.meta.loader?.(queryClient, to, "prefetch")).catch(
		() => {},
	);
}
