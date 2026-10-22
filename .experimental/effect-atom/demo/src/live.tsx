/**
 * The live demo: the boundary chain around a doc list and a doc page, with the
 * chaos panel and the event log beside it, and the type controls below. It
 * brings its own atom registry, so it runs in any React tree, such as the docs
 * site's.
 */
import { RegistryProvider } from "@effect/atom-react";
import { Skeleton } from "@examples/ui/components/skeleton";
import { Suspense, useState } from "react";

import {
	App,
	DocAccess,
	DocAccessAll,
	Network,
	Session,
} from "./boundaries.tsx";
import { DocList, DocPage, DocPageAll } from "./docs.tsx";
import { Frame } from "./frame.tsx";
import { ChaosPanel, EventLog } from "./panel.tsx";
import { defaults, type Levels } from "./type-levels.ts";
import {
	runnable,
	TypeCode,
	TypeSwitches,
	type Variant,
} from "./type-panel.tsx";

const Loading = () => (
	<div className="space-y-2">
		<Skeleton className="h-4 w-2/3" />
		<Skeleton className="h-4 w-1/2" />
		<Skeleton className="h-4 w-3/4" />
	</div>
);

const Live = (props: { readonly variant: Variant }) => {
	const [selected, setSelected] = useState(1);
	return (
		<Suspense fallback={<Loading />}>
			<App>
				<Frame catches="defects and interrupts" name="App" tone="root">
					<Network>
						<Frame catches="RpcClientError" name="Network" tone="network">
							<Session>
								<Frame catches="Unauthorized" name="Session" tone="session">
									<div className="grid gap-3 @lg:grid-cols-[200px_minmax(0,1fr)]">
										<Suspense fallback={<Loading />}>
											<DocList onSelect={setSelected} selected={selected} />
										</Suspense>
										{props.variant === "docAccessAll" ? (
											<DocAccessAll key={selected}>
												<Frame
													catches="Forbidden, DocNotFound"
													name="DocAccess"
													tone="access"
												>
													<Suspense fallback={<Loading />}>
														<DocPageAll id={selected} />
													</Suspense>
												</Frame>
											</DocAccessAll>
										) : (
											<DocAccess key={selected}>
												<Frame
													catches="Forbidden"
													name="DocAccess"
													tone="access"
												>
													<Suspense fallback={<Loading />}>
														<DocPage id={selected} />
													</Suspense>
												</Frame>
											</DocAccess>
										)}
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

export const Playground = () => {
	const [levels, setLevels] = useState<Levels>(defaults);
	const [running, setRunning] = useState<Variant>("docAccess");
	return (
		<RegistryProvider defaultIdleTTL={400}>
			<div className="@container">
				<div className="grid gap-6 @3xl:grid-cols-[minmax(0,1fr)_300px]">
					<div className="@container min-w-0">
						<Live variant={running} />
					</div>
					<aside className="space-y-8">
						<ChaosPanel />
						<EventLog />
					</aside>
					<div className="order-last min-w-0 @3xl:order-none">
						<TypeCode levels={levels} running={running} />
					</div>
					<aside>
						<TypeSwitches
							levels={levels}
							onChange={(next) => {
								setLevels(next);
								const variant = runnable(next);
								if (variant !== undefined) {
									setRunning(variant);
								}
							}}
						/>
					</aside>
				</div>
			</div>
		</RegistryProvider>
	);
};
