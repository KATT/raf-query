"use client";

import { QueryProvider, recommended } from "@raf-query/react";
import type { ReactNode } from "react";

export function AppQueryProvider(props: { children: ReactNode }) {
	return (
		<QueryProvider config={{ ...recommended(), staleTime: 5000 }}>
			{props.children}
		</QueryProvider>
	);
}
