import { Skeleton } from "@examples/ui/components/skeleton";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@examples/ui/components/tabs";
import { Suspense, useState } from "react";

import { App, DocAccess, Network, Session } from "./boundaries.tsx";
import { DocList, DocPage } from "./docs.tsx";
import { Frame } from "./frame.tsx";
import { ChaosPanel, EventLog } from "./panel.tsx";
import { TypeErrors } from "./type-errors.tsx";

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

export const Demo = () => (
	<div className="mx-auto max-w-7xl space-y-6 p-6">
		<header className="space-y-1">
			<h1 className="text-2xl font-semibold">
				effect-query: typed error boundaries
			</h1>
			<p className="max-w-3xl text-sm text-muted-foreground">
				Each boundary catches some of the errors an Effect RPC call can fail
				with, and takes them off the type of every hook read through it. A
				failure goes to the innermost boundary that catches it; what no boundary
				catches comes back to the component, which the compiler makes handle it.
			</p>
		</header>
		<Tabs defaultValue="live">
			<TabsList>
				<TabsTrigger value="live">Live</TabsTrigger>
				<TabsTrigger value="types">Type errors</TabsTrigger>
			</TabsList>
			<TabsContent className="pt-3" value="live">
				<div className="grid gap-6 lg:grid-cols-[1fr_300px]">
					<Live />
					<aside className="space-y-8">
						<ChaosPanel />
						<EventLog />
					</aside>
				</div>
			</TabsContent>
			<TabsContent className="pt-3" value="types">
				<TypeErrors />
			</TabsContent>
		</Tabs>
	</div>
);
