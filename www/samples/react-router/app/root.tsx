import { QueryClient, QueryClientProvider } from "@raf-query/react";
import { QueryDevtools } from "@raf-query/react/devtools";
import { type ReactNode, useState } from "react";
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";

export function Layout(props: { readonly children: ReactNode }) {
	return (
		<html lang="en">
			<head>
				<meta charSet="utf-8" />
				<Meta />
				<Links />
			</head>
			<body>
				{props.children}
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}

// #region app
export default function App() {
	const [queryClient] = useState(
		() => new QueryClient({ defaults: { staleTime: 5000 } }),
	);
	return (
		<QueryClientProvider client={queryClient}>
			<Outlet />
			{import.meta.env.DEV ? <QueryDevtools /> : null}
		</QueryClientProvider>
	);
}
// #endregion app
