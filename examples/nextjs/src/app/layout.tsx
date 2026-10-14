import "./globals.css";

import { LATENCY_COOKIE, parseLatency } from "@examples/db/types";
import { QueryDevtools } from "@raf-query/react/devtools";
import { QueryProvider } from "@raf-query/react/rsc";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";

import { AppLink, Settings, SettingsProvider } from "~/components/settings.tsx";
import { queryClientConfig } from "~/query-client.ts";
import { parsePrefetch, PREFETCH_COOKIE } from "~/settings.ts";

export const metadata = {
	title: "Issues · raf-query on Next.js",
} satisfies Metadata;

export default async function RootLayout(props: {
	readonly children: ReactNode;
}) {
	const cookieStore = await cookies();

	return (
		<html lang="en">
			<body className="min-h-screen antialiased">
				<SettingsProvider
					prefetch={parsePrefetch(cookieStore.get(PREFETCH_COOKIE)?.value)}
				>
					<header className="border-b">
						<nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
							<AppLink className="font-semibold" href="/issues">
								Issues
							</AppLink>
							<span className="text-sm text-muted-foreground">
								raf-query · Next.js
							</span>
							<div className="ml-auto">
								<Settings
									latency={parseLatency(cookieStore.get(LATENCY_COOKIE)?.value)}
								/>
							</div>
						</nav>
					</header>
					<main className="mx-auto max-w-5xl px-6 py-8">
						<QueryProvider config={queryClientConfig}>
							{props.children}
							<QueryDevtools />
						</QueryProvider>
					</main>
				</SettingsProvider>
			</body>
		</html>
	);
}
