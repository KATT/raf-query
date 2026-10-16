import { Skeleton } from "@examples/ui/components/skeleton";
import { useQueryClient } from "@raf-query/react";
import {
	type AnyRoute,
	createMemoryHistory,
	createRouter,
	RouterProvider,
	useRouterState,
} from "@tanstack/react-router";
import { useState } from "react";

import { BrowserWindow, type DemoNavigation } from "./browser.tsx";
import { useDemoSession } from "./session.ts";

const navigatingAttribute = "data-demo-navigating";

/** A page's first load, before its loader has data to render. */
function PageSkeleton() {
	return (
		<div aria-label="Loading page" className="grid gap-2" role="status">
			<Skeleton className="h-8 w-full" />
			<Skeleton className="h-8 w-full" />
			<Skeleton className="h-8 w-2/3" />
		</div>
	);
}

/**
 * A TanStack Router app in a browser window, on its own memory history.
 * Loaders get the session's query client as `context.queryClient`, as in an
 * app. Reload starts the variant over on the same URL: a new client and
 * router, and an emptied server.
 */
export function DemoRouter(props: {
	readonly initial: string;
	readonly routeTree: AnyRoute;
}) {
	const queryClient = useQueryClient();
	const session = useDemoSession();
	const [router] = useState(() => {
		const history = createMemoryHistory({
			initialEntries: [session.location ?? props.initial],
		});
		let lastAction = "PUSH";
		history.subscribe((event) => {
			lastAction = event.action.type;
		});
		return createRouter({
			context: { queryClient },
			// A stale loader reruns before the page renders, instead of the router
			// showing its last loader data meanwhile, so what each verb waits for
			// is what the page waits for.
			defaultStaleReloadMode: "blocking",
			defaultViewTransition: {
				types: (change): Array<DemoNavigation> | false => {
					if (!change.fromLocation || !change.hrefChanged) {
						return false;
					}
					return lastAction === "BACK" ? ["demo-back"] : ["demo-forward"];
				},
			},
			history,
			routeTree: props.routeTree,
			// The router scrolls the window to the top after each navigation, its
			// first load included, unless this returns false. The window is the
			// docs page, not the demo.
			scrollRestoration: () => false,
		});
	});
	const href = useRouterState({
		router,
		select: (state) => state.location.href,
	});
	const canGoBack = useRouterState({
		router,
		select: () => router.history.canGoBack(),
	});
	const isNavigating = useRouterState({
		router,
		select: (state) => state.status === "pending",
	});
	// Until its first load resolves, the router renders nothing.
	const isFirstLoad = useRouterState({
		router,
		select: (state) => state.resolvedLocation === undefined,
	});
	return (
		<BrowserWindow
			canGoBack={canGoBack}
			href={href}
			isNavigating={isNavigating}
			onBack={() => {
				router.history.back();
			}}
			onReload={() => {
				session.reload(href);
			}}
		>
			{/* Several demos can share a page, and view transition names must be
			    unique: the marker moves to whichever window navigates last, and
			    styles.css names only that one. */}
			<div
				ref={(page) => {
					if (page === null) {
						return;
					}
					return router.subscribe("onBeforeNavigate", () => {
						for (const marked of document.querySelectorAll(
							`[${navigatingAttribute}]`,
						)) {
							marked.removeAttribute(navigatingAttribute);
						}
						page.setAttribute(navigatingAttribute, "");
					});
				}}
			>
				{isFirstLoad ? <PageSkeleton /> : null}
				<RouterProvider router={router} />
			</div>
		</BrowserWindow>
	);
}
