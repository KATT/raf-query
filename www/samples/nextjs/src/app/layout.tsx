import { QueryDevtools } from "@raf-query/react/devtools";
import type { ReactNode } from "react";

import { AppQueryProvider } from "~/components/query-provider.tsx";

export default function RootLayout(props: { children: ReactNode }) {
	return (
		<html lang="en">
			<body>
				<AppQueryProvider>
					{props.children}
					{process.env.NODE_ENV !== "production" ? <QueryDevtools /> : null}
				</AppQueryProvider>
			</body>
		</html>
	);
}
