/// <reference types="vite/client" />
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@raf-query/react";
import { QueryDevtools } from "@raf-query/react/devtools";

// #region vite-app
export function App(props: { children: ReactNode; queryClient: QueryClient }) {
	return (
		<QueryClientProvider client={props.queryClient}>
			{props.children}
			{import.meta.env.DEV ? <QueryDevtools /> : null}
		</QueryClientProvider>
	);
}
// #endregion
