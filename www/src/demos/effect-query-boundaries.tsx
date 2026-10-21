import { Skeleton } from "@examples/ui/components/skeleton";
import { Suspense, useState } from "react";

import { defineStandaloneDemo } from "~/demo-kit/define.ts";

import {
	App,
	DocAccess,
	Network,
	Session,
} from "./effect-query-boundaries/boundaries.tsx";
import { DocList, DocPage } from "./effect-query-boundaries/docs.tsx";
import { Frame } from "./effect-query-boundaries/frame.tsx";
import { ChaosPanel, EventLog } from "./effect-query-boundaries/panel.tsx";

function Loading() {
	return (
		<div className="space-y-2">
			<Skeleton className="h-4 w-2/3" />
			<Skeleton className="h-4 w-1/2" />
			<Skeleton className="h-4 w-3/4" />
		</div>
	);
}

function Live() {
	const [selected, setSelected] = useState(1);
	return (
		<Suspense fallback={<Loading />}>
			<App>
				<Frame catches="defects and interrupts" name="App" tone="root">
					<Network>
						<Frame catches="RpcClientError" name="Network" tone="network">
							<Session>
								<Frame catches="Unauthorized" name="Session" tone="session">
									<div className="grid gap-3 @xl:grid-cols-[11rem_minmax(0,1fr)]">
										<Suspense fallback={<Loading />}>
											<DocList onSelect={setSelected} selected={selected} />
										</Suspense>
										<DocAccess key={selected}>
											<Frame catches="Forbidden" name="DocAccess" tone="access">
												<Suspense fallback={<Loading />}>
													<DocPage id={selected} />
												</Suspense>
											</Frame>
										</DocAccess>
									</div>
								</Frame>
							</Session>
						</Frame>
					</Network>
				</Frame>
			</App>
		</Suspense>
	);
}

function EffectQueryBoundaries() {
	return (
		<div className="grid gap-6 @4xl:grid-cols-[minmax(0,1fr)_15rem]">
			<Live />
			<aside className="grid content-start gap-6 @xl:grid-cols-2 @4xl:grid-cols-1">
				<ChaosPanel />
				<EventLog />
			</aside>
		</div>
	);
}

export default defineStandaloneDemo({
	Component: EffectQueryBoundaries,
	hint: "Break the server with the switches: each failure lands in the innermost boundary that catches it, whose outline turns solid. Its button fixes the cause and retries. DocNotFound has no boundary, so the page handles it inline.",
	title: "Typed error boundaries over Effect RPC",
});
