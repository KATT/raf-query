/// <reference types="vite/client" />
import { Logo } from "@examples/ui/components/logo";
import { logoUrl } from "@examples/ui/lib/logo";
import type { QueryClient } from "@raf-query/react";
import {
	createRootRouteWithContext,
	HeadContent,
	Link,
	Outlet,
	Scripts,
	useRouter,
} from "@tanstack/react-router";
import { type ReactNode, useState } from "react";

import { Settings } from "~/components/settings.tsx";
import type { Issues } from "~/issues.ts";
import { readPrefetch, toDefaultPreload } from "~/settings.ts";
import appCss from "~/styles.css?url";

export const Route = createRootRouteWithContext<{
	queryClient: QueryClient<Issues>;
}>()({
	head: () => ({
		links: [
			{ href: appCss, rel: "stylesheet" },
			{ href: logoUrl, rel: "icon", type: "image/svg+xml" },
		],
		meta: [
			{ charSet: "utf8" },
			{ content: "width=device-width, initial-scale=1", name: "viewport" },
			{ title: "Issues · raf-query on TanStack Start with Effect" },
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

	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body className="min-h-screen antialiased">
				<header className="border-b">
					<nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
						<Link
							className="flex items-center gap-2.5 font-semibold"
							key={prefetch}
							to="/issues"
						>
							<Logo alt="" />
							Issues
						</Link>
						<span className="text-sm text-muted-foreground">
							raf-query · TanStack Start · Effect
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
								prefetch={prefetch}
							/>
						</div>
					</nav>
				</header>
				{/* Remounts the page, so every `Link` picks up a new prefetch setting. */}
				<main className="mx-auto max-w-5xl px-6 py-8" key={prefetch}>
					{props.children}
				</main>
				<Scripts />
			</body>
		</html>
	);
}
