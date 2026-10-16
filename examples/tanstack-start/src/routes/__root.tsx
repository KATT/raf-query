/// <reference types="vite/client" />
import {
	DEFAULT_LOADER_VERB,
	type QueryTimeDefaults,
} from "@examples/db/types";
import { Logo } from "@examples/kit/components/logo";
import { ThemeProvider } from "@examples/kit/components/theme-provider";
import { logoUrl } from "@examples/kit/lib/logo";
import { Toaster } from "@examples/ui/components/sonner";
import type { QueryClient } from "@raf-query/react";
import {
	createRootRouteWithContext,
	HeadContent,
	Link,
	Outlet,
	Scripts,
	useParams,
	useRouter,
} from "@tanstack/react-router";
import { type ReactNode, useState } from "react";

import { Settings } from "~/components/settings.tsx";
import { readPrefetch, toDefaultPreload } from "~/settings.ts";
import appCss from "~/styles.css?url";

export const Route = createRootRouteWithContext<{
	queryClient: QueryClient;
	queryDefaults: QueryTimeDefaults;
}>()({
	head: () => ({
		links: [
			{ href: appCss, rel: "stylesheet" },
			{ href: logoUrl, rel: "icon", type: "image/svg+xml" },
		],
		meta: [
			{ charSet: "utf8" },
			{ content: "width=device-width, initial-scale=1", name: "viewport" },
			{ title: "Issues · raf-query on TanStack Start" },
		],
	}),
	component: Outlet,
	notFoundComponent: () => (
		<p className="text-muted-foreground">Nothing here.</p>
	),
	shellComponent: RootDocument,
});

function RootDocument(props: { readonly children: ReactNode }) {
	const router = useRouter();
	const [prefetch, setPrefetch] = useState(readPrefetch);
	const { verb } = useParams({ strict: false });

	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<HeadContent />
			</head>
			<body className="min-h-screen antialiased">
				<ThemeProvider>
					<header className="border-b">
						<nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
							<Link
								className="flex items-center gap-2.5 font-semibold"
								key={prefetch}
								params={{ verb: verb ?? DEFAULT_LOADER_VERB }}
								to="/$verb/issues"
							>
								<Logo alt="" />
								Issues
							</Link>
							<span className="text-sm text-muted-foreground">
								raf-query · TanStack Start
							</span>
							<div className="ml-auto">
								<Settings
									onPrefetchChange={(next) => {
										router.update({
											...router.options,
											defaultPreload: toDefaultPreload(next),
										});
										setPrefetch(next);
									}}
									onReset={() => {
										router.options.context.queryClient.clear();
										router.clearCache();
										window.location.reload();
									}}
									prefetch={prefetch}
									queryDefaults={router.options.context.queryDefaults}
								/>
							</div>
						</nav>
					</header>
					{/* Remounts the page, so every `Link` picks up a new prefetch setting. */}
					<main
						className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8"
						key={prefetch}
					>
						{props.children}
					</main>
					<Toaster closeButton position="bottom-right" richColors />
				</ThemeProvider>
				<Scripts />
			</body>
		</html>
	);
}
