import { QueryDevtools } from "@raf-query/react";
import type { ReactNode } from "react";

import { Providers } from "~/components/providers.tsx";

export default function RootLayout(props: { children: ReactNode }) {
	return (
		<html lang="en">
			<body>
				<Providers>
					{props.children}
					{process.env.NODE_ENV !== "production" ? <QueryDevtools /> : null}
				</Providers>
			</body>
		</html>
	);
}
