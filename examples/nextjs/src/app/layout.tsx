import "./globals.css";

import {
	DEFAULT_STALE_TIME,
	LATENCY_COOKIE,
	parseLatency,
	parseStaleTime,
	STALE_TIME_COOKIE,
} from "@examples/db/types";
import { Logo } from "@examples/kit/components/logo";
import { logoUrl } from "@examples/kit/lib/logo";
import { Toaster } from "@examples/ui/components/sonner";
import { QueryDevtools } from "@raf-query/react/devtools";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";

import { AppQueryProvider } from "~/components/app-query-provider.tsx";
import { IssuesLink } from "~/components/loader-verb.tsx";
import { Settings, SettingsProvider } from "~/components/settings.tsx";
import { ThemeProvider } from "~/components/theme-provider.tsx";
import { parsePrefetch, PREFETCH_COOKIE } from "~/settings.ts";

export const metadata = {
	icons: { icon: logoUrl },
	title: "Issues · raf-query on Next.js",
} satisfies Metadata;

export default async function RootLayout(props: {
	readonly children: ReactNode;
}) {
	const cookieStore = await cookies();
	const staleTime = parseStaleTime(cookieStore.get(STALE_TIME_COOKIE)?.value);

	return (
		<html lang="en" suppressHydrationWarning>
			<body className="min-h-screen antialiased">
				<ThemeProvider>
					<AppQueryProvider staleTime={staleTime ?? DEFAULT_STALE_TIME}>
						<SettingsProvider
							prefetch={parsePrefetch(cookieStore.get(PREFETCH_COOKIE)?.value)}
						>
							<header className="border-b">
								<nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
									<IssuesLink className="flex items-center gap-2.5 font-semibold">
										<Logo alt="" />
										Issues
									</IssuesLink>
									<span className="text-sm text-muted-foreground">
										raf-query · Next.js
									</span>
									<div className="ml-auto">
										<Settings
											latency={parseLatency(
												cookieStore.get(LATENCY_COOKIE)?.value,
											)}
											staleTime={staleTime}
										/>
									</div>
								</nav>
							</header>
							<main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
								{props.children}
								<QueryDevtools />
							</main>
							<Toaster closeButton position="bottom-right" richColors />
						</SettingsProvider>
					</AppQueryProvider>
				</ThemeProvider>
			</body>
		</html>
	);
}
