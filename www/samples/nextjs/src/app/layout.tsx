import { QueryDevtools } from "@raf-query/react/devtools";
import { QueryProvider } from "@raf-query/react/rsc";
import type { ReactNode } from "react";

import { queryClientConfig } from "~/query-client.ts";

export default function RootLayout(props: { children: ReactNode }) {
	return (
		<html lang="en">
			<body>
				<QueryProvider config={queryClientConfig}>
					{props.children}
					{process.env.NODE_ENV !== "production" ? <QueryDevtools /> : null}
				</QueryProvider>
			</body>
		</html>
	);
}
