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
} from "@tanstack/react-router";
import type { ReactNode } from "react";

import appCss from "~/styles.css?url";

export const Route = createRootRouteWithContext<{
	queryClient: QueryClient;
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
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body className="min-h-screen antialiased">
				<header className="border-b bg-card">
					<div aria-hidden className="h-1 bg-brand-gradient" />
					<nav className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-3">
						<Link
							className="flex items-center gap-2.5 font-semibold"
							to="/issues"
						>
							<Logo alt="" />
							Issues
						</Link>
						<span className="ml-auto text-sm text-muted-foreground">
							raf-query · TanStack Start
						</span>
					</nav>
				</header>
				<main className="mx-auto max-w-5xl px-6 py-8">{props.children}</main>
				<Scripts />
			</body>
		</html>
	);
}
