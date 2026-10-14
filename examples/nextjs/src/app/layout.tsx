import "./globals.css";

import { Logo } from "@examples/ui/components/logo";
import { logoUrl } from "@examples/ui/lib/logo";
import { QueryDevtools } from "@raf-query/react/devtools";
import { QueryProvider } from "@raf-query/react/rsc";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { queryClientConfig } from "~/query-client.ts";

export const metadata = {
	icons: { icon: logoUrl },
	title: "Issues · raf-query on Next.js",
} satisfies Metadata;

export default function RootLayout(props: { readonly children: ReactNode }) {
	return (
		<html lang="en">
			<body className="min-h-screen antialiased">
				<header className="border-b bg-card">
					<div aria-hidden className="h-1 bg-brand-gradient" />
					<nav className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-3">
						<Link
							className="flex items-center gap-2.5 font-semibold"
							href="/issues"
						>
							<Logo alt="" />
							Issues
						</Link>
						<span className="ml-auto text-sm text-muted-foreground">
							raf-query · Next.js
						</span>
					</nav>
				</header>
				<main className="mx-auto max-w-5xl px-6 py-8">
					<QueryProvider config={queryClientConfig}>
						{props.children}
						<QueryDevtools />
					</QueryProvider>
				</main>
			</body>
		</html>
	);
}
