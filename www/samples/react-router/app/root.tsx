import { QueryDevtools } from "@raf-query/react/devtools";
import type { ReactNode } from "react";
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";

import { Providers } from "~/providers.tsx";
import { makeQueryClient, queryClientContext } from "~/query-client.ts";

import type { Route } from "./+types/root";

// #region middleware
export const middleware: Array<Route.MiddlewareFunction> = [
	({ context }) => {
		context.set(queryClientContext, makeQueryClient());
	},
];
// #endregion middleware

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
	return (
		<Providers>
			<Outlet />
			{import.meta.env.DEV ? <QueryDevtools /> : null}
		</Providers>
	);
}
// #endregion app
