/**
 * The live demo: the boundary chain around a doc list and a doc page, with the
 * chaos panel and the event log beside it. It brings its own atom registry, so
 * it runs in any React tree, such as the docs site's.
 */
import { RegistryProvider } from "@effect/atom-react";
import { Skeleton } from "@examples/ui/components/skeleton";
import { Suspense, useState } from "react";

import { App, DocAccess, Network, Session } from "./boundaries.tsx";
import { DocList, DocPage } from "./docs.tsx";
import { Frame } from "./frame.tsx";
import { ChaosPanel, EventLog } from "./panel.tsx";

const Loading = () => (
	<div className="space-y-2">
		<Skeleton className="h-4 w-2/3" />
		<Skeleton className="h-4 w-1/2" />
		<Skeleton className="h-4 w-3/4" />
	</div>
);

const Live = () => {
	const [selected, setSelected] = useState(1);
	return (
		<Suspense fallback={<Loading />}>
			<App>
				<Frame catches="defects and interrupts" name="App" tone="root">
					<Network>
						<Frame catches="RpcClientError" name="Network" tone="network">
							<Session>
								<Frame catches="Unauthorized" name="Session" tone="session">
									<div className="grid gap-3 md:grid-cols-[220px_1fr]">
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
};

export const Playground = () => (
	<RegistryProvider defaultIdleTTL={400}>
		<div className="grid gap-6 lg:grid-cols-[1fr_300px]">
			<Live />
			<aside className="space-y-8">
				<ChaosPanel />
				<EventLog />
			</aside>
		</div>
	</RegistryProvider>
);
