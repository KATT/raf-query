import {
	applyStaleTime,
	DEFAULT_STALE_TIME,
	queryTimeDefaults,
	type QueryTimeDefaults,
} from "@examples/db/types";
import { Logo } from "@examples/ui/components/logo";
import { Toaster } from "@examples/ui/components/sonner";
import { logoUrl } from "@examples/ui/lib/logo";
import {
	QueryClient,
	QueryClientProvider,
	useQueryClient,
} from "@raf-query/react";
import { QueryDevtools } from "@raf-query/react/devtools";
import { useState } from "react";
import {
	isRouteErrorResponse,
	Link,
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
} from "react-router";

import { Settings } from "~/components/settings.tsx";
import {
	DEFAULT_PREFETCH,
	type Prefetch,
	readPrefetch,
	readStaleTime,
	withRequest,
} from "~/settings.ts";

import type { Route } from "./+types/root";
import "./app.css";

export const links: Route.LinksFunction = () => [
	{ href: logoUrl, rel: "icon", type: "image/svg+xml" },
];

export function loader(args: Route.LoaderArgs) {
	return withRequest(args.request, () => ({
		prefetch: readPrefetch(),
		staleTime: readStaleTime() ?? DEFAULT_STALE_TIME,
	}));
}

export function Layout(props: { readonly children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<meta charSet="utf-8" />
				<meta content="width=device-width, initial-scale=1" name="viewport" />
				<title>Issues · raf-query on React Router</title>
				<Meta />
				<Links />
			</head>
			<body className="min-h-screen antialiased">
				{props.children}
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}

export default function App(props: Route.ComponentProps) {
	const [{ queryClient, queryDefaults }] = useState(() => {
		const defaults = queryTimeDefaults(props.loaderData.staleTime);
		const client = new QueryClient({ defaults });
		// The cache reads this object live. A server client leaves `gcTime` unset.
		if (!client.isServer) {
			applyStaleTime(defaults, props.loaderData.staleTime);
		}
		return { queryClient: client, queryDefaults: defaults };
	});
	const [prefetch, setPrefetch] = useState(
		() => props.loaderData.prefetch ?? DEFAULT_PREFETCH,
	);

	return (
		<QueryClientProvider client={queryClient}>
			<header className="border-b">
				<nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
					<Link
						className="flex items-center gap-2.5 font-semibold"
						prefetch={prefetch}
						to="/issues"
					>
						<Logo alt="" />
						Issues
					</Link>
					<span className="text-sm text-muted-foreground">
						raf-query · React Router
					</span>
					<div className="ml-auto">
						<AppSettings
							onPrefetchChange={setPrefetch}
							prefetch={prefetch}
							queryDefaults={queryDefaults}
						/>
					</div>
				</nav>
			</header>
			<main
				className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8"
				key={prefetch}
			>
				<Outlet />
			</main>
			<QueryDevtools />
			<Toaster closeButton position="bottom-right" richColors />
		</QueryClientProvider>
	);
}

function AppSettings(props: {
	readonly onPrefetchChange: (prefetch: Prefetch) => void;
	readonly prefetch: Prefetch;
	readonly queryDefaults: QueryTimeDefaults;
}) {
	const queryClient = useQueryClient();
	return (
		<Settings
			onPrefetchChange={props.onPrefetchChange}
			onReset={() => {
				queryClient.clear();
				window.location.reload();
			}}
			prefetch={props.prefetch}
			queryDefaults={props.queryDefaults}
		/>
	);
}

export function ErrorBoundary(props: Route.ErrorBoundaryProps) {
	let message = "Oops!";
	let details = "An unexpected error occurred.";
	let stack: string | undefined;

	if (isRouteErrorResponse(props.error)) {
		message = props.error.status === 404 ? "404" : "Error";
		details =
			props.error.status === 404
				? "The requested page could not be found."
				: props.error.statusText || details;
	} else if (
		import.meta.env.DEV &&
		props.error &&
		props.error instanceof Error
	) {
		details = props.error.message;
		stack = props.error.stack;
	}

	return (
		<main className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
			<h1 className="text-2xl font-semibold">{message}</h1>
			<p className="mt-2 text-muted-foreground">{details}</p>
			{stack ? (
				<pre className="mt-4 w-full overflow-x-auto rounded-lg border p-4 text-sm">
					<code>{stack}</code>
				</pre>
			) : null}
		</main>
	);
}
