import {
	type QueryClient,
	QueryClientProvider,
	QueryDevtools,
} from "@raf-query/react";
import type { ReactNode } from "react";

declare const props: { children: ReactNode };

declare const queryClient: QueryClient;

// #region intro
function App() {
	return (
		<QueryClientProvider client={queryClient}>
			{props.children}
			{import.meta.env.DEV ? <QueryDevtools /> : null}
		</QueryClientProvider>
	);
}
// #endregion
