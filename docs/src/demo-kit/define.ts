import type { QueryClient } from "@raf-query/react";
import type { ComponentType } from "react";

import type { FakeServer } from "./server.ts";

export interface DemoDefinition {
	readonly Component: ComponentType;
	/** A fresh client per session; demos that need other defaults pass them here. */
	readonly createClient?: () => QueryClient;
	/** One sentence on what to try. */
	readonly hint: string;
	readonly server: FakeServer<unknown>;
	readonly title: string;
}

export function defineDemo(demo: DemoDefinition): DemoDefinition {
	return demo;
}
