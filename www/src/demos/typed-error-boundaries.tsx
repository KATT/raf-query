import { Switch } from "@examples/ui/components/switch";
import { QueryClient, useQueryClient, useWaterfall } from "@raf-query/react";
import {
	type ComponentType,
	type ReactNode,
	Suspense,
	useState,
	useSyncExternalStore,
} from "react";

import { defineDemo } from "~/demo-kit/define.ts";

import { App, chains, Network } from "./typed-error-boundaries/chains.tsx";
import {
	getChaos,
	setChaos,
	subscribeChaos,
	toggle,
} from "./typed-error-boundaries/chaos.ts";
import { DocsClientLive, server } from "./typed-error-boundaries/client.ts";
import { Outline, type Tone } from "./typed-error-boundaries/fallbacks.tsx";
import { getCaught, subscribeCaught } from "./typed-error-boundaries/log.ts";
import { docListQuery, docQuery } from "./typed-error-boundaries/queries.ts";
import {
	type ChainId,
	initialTypeConfig,
	runnableChain,
	type TypeConfig,
} from "./typed-error-boundaries/switches.ts";
import {
	TypeCode,
	TypeSwitches,
} from "./typed-error-boundaries/type-controls.tsx";

function ChaosSwitch(props: {
	readonly checked: boolean;
	readonly hint: string;
	readonly label: string;
	readonly onChange: (checked: boolean) => void;
}) {
	return (
		<label className="flex items-start justify-between gap-3 text-sm">
			<span className="grid">
				<span className="font-medium">{props.label}</span>
				<span className="text-xs text-muted-foreground">{props.hint}</span>
			</span>
			<Switch
				checked={props.checked}
				onCheckedChange={props.onChange}
				size="sm"
			/>
		</label>
	);
}

function Panel() {
	const client = useQueryClient();
	const chaos = useSyncExternalStore(subscribeChaos, getChaos, getChaos);
	const events = useSyncExternalStore(subscribeCaught, getCaught, getCaught);
	// A reset, not an invalidate: a refetch that fails keeps its data on
	// screen, and only a load with nothing to show goes to a boundary.
	const change = (patch: Parameters<typeof setChaos>[0]) => {
		setChaos(patch);
		void client.reset({});
	};
	return (
		<aside className="grid content-start gap-4">
			<div className="grid gap-2.5">
				<p className="text-xs font-medium">Break it</p>
				<ChaosSwitch
					checked={!chaos.signedIn}
					hint="Unauthorized"
					label="Sign out"
					onChange={(checked) => {
						change({ signedIn: !checked });
					}}
				/>
				<ChaosSwitch
					checked={chaos.offline}
					hint="RpcClientError"
					label="Go offline"
					onChange={(checked) => {
						change({ offline: checked });
					}}
				/>
				<ChaosSwitch
					checked={chaos.serverBug}
					hint="GetDoc dies: a defect"
					label="Server bug"
					onChange={(checked) => {
						change({ serverBug: checked });
					}}
				/>
				<ChaosSwitch
					checked={chaos.locked.has(2)}
					hint="Forbidden for Routing"
					label="Lock doc 2"
					onChange={() => {
						change({ locked: toggle(chaos.locked, 2) });
					}}
				/>
				<ChaosSwitch
					checked={chaos.deleted.has(1)}
					hint="DocNotFound for Design notes"
					label="Delete doc 1"
					onChange={() => {
						change({ deleted: toggle(chaos.deleted, 1) });
					}}
				/>
			</div>
			<div className="grid gap-1.5">
				<p className="text-xs font-medium">Where failures went</p>
				{events.length === 0 ? (
					<p className="text-xs text-muted-foreground">Nothing caught yet.</p>
				) : (
					<ol className="grid gap-1 text-xs">
						{events.map((event) => (
							<li className="flex items-baseline gap-1.5" key={event.id}>
								<span className="rounded bg-muted px-1.5 py-0.5 font-mono">
									{event.by}
								</span>
								{event.what}
							</li>
						))}
					</ol>
				)}
			</div>
		</aside>
	);
}

/** A boundary in its outline, or just the children when the chain has none there. */
function Optional(props: {
	readonly boundary:
		| ComponentType<{ readonly children?: ReactNode }>
		| undefined;
	readonly catches: string;
	readonly children: ReactNode;
	readonly name: string;
	readonly tone: Tone;
}) {
	const Provider = props.boundary;
	if (Provider === undefined) {
		return props.children;
	}
	return (
		<Provider>
			<Outline catches={props.catches} name={props.name} tone={props.tone}>
				{props.children}
			</Outline>
		</Provider>
	);
}

function Loading() {
	return <p className="text-sm text-muted-foreground">Loading…</p>;
}

function Docs() {
	const [selected, setSelected] = useState(1);
	const [types, setTypes] = useState<TypeConfig>(initialTypeConfig);
	const [running, setRunning] = useState<ChainId>("session-inline");
	const list = useWaterfall(docListQuery);
	const doc = useWaterfall(docQuery, { id: selected });
	const chain = chains[running];
	return (
		<div className="grid gap-4 @2xl:grid-cols-[minmax(0,1fr)_12rem]">
			<App key={running}>
				<Outline catches="defects" name="App" tone="root">
					<Network>
						<Outline catches="RpcClientError" name="Network" tone="network">
							<Optional
								boundary={chain.Session}
								catches="Unauthorized"
								name="Session"
								tone="session"
							>
								<div className="grid gap-3 @lg:grid-cols-[10rem_minmax(0,1fr)]">
									<Suspense fallback={<Loading />}>
										<chain.DocList
											list={list}
											onSelect={setSelected}
											selected={selected}
										/>
									</Suspense>
									<Optional
										boundary={chain.DocAccess}
										catches={chain.accessCatches}
										key={selected}
										name="DocAccess"
										tone="access"
									>
										<Optional
											boundary={chain.DocExists}
											catches="DocNotFound"
											name="DocExists"
											tone="exists"
										>
											<Suspense fallback={<Loading />}>
												<chain.DocPage doc={doc} />
											</Suspense>
										</Optional>
									</Optional>
								</div>
							</Optional>
						</Outline>
					</Network>
				</Outline>
			</App>
			<Panel />
			<div
				className="grid scroll-mt-20 gap-4 @2xl:col-span-2 @2xl:grid-cols-[minmax(0,1fr)_12rem]"
				id="type-controls"
				// The demo renders after the page loads, too late for the browser to scroll to it.
				ref={(element) => {
					if (element !== null && window.location.hash === "#type-controls") {
						element.scrollIntoView();
					}
				}}
			>
				<div className="@2xl:order-2">
					<TypeSwitches
						config={types}
						onChange={(next) => {
							setTypes(next);
							setRunning((current) => runnableChain(next) ?? current);
						}}
					/>
				</div>
				<TypeCode config={types} />
			</div>
		</div>
	);
}

export default defineDemo({
	Component: Docs,
	createClient: () => new QueryClient({ layer: DocsClientLive }),
	hint: "Break the server: each failure lands on the boundary that lists its tag. Change the types: the code under the app is what tsc said about them at build time, and the app runs them when they compile.",
	server,
	title: "Typed error boundaries",
});
