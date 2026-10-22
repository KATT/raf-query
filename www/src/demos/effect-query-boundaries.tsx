import { Skeleton } from "@examples/ui/components/skeleton";
import { CircleX } from "lucide-react";
import { type ReactNode, Suspense, useState } from "react";

import { defineStandaloneDemo } from "~/demo-kit/define.ts";

import {
	type Chain,
	chainOf,
	type Link,
} from "./effect-query-boundaries/boundaries.tsx";
import { type Config, idOf } from "./effect-query-boundaries/configs.ts";
import {
	DocList,
	DocPageData,
	DocPageResult,
} from "./effect-query-boundaries/docs.tsx";
import { Frame, type Tone } from "./effect-query-boundaries/frame.tsx";
import { ChaosPanel, EventLog } from "./effect-query-boundaries/panel.tsx";
import { useConfig } from "./effect-query-boundaries/switches.ts";
import {
	CodePanel,
	errorsIn,
	TypesPanel,
} from "./effect-query-boundaries/types.tsx";

function Loading() {
	return (
		<div className="space-y-2">
			<Skeleton className="h-4 w-2/3" />
			<Skeleton className="h-4 w-1/2" />
			<Skeleton className="h-4 w-3/4" />
		</div>
	);
}

const tones = {
	App: "root",
	DocAccess: "access",
	Network: "network",
	Session: "session",
} satisfies Record<Link["name"], Tone>;

/** A boundary of the chain, outlined with what it catches. */
const Mount = (props: {
	readonly children: ReactNode;
	readonly link: Link;
}) => (
	<props.link.Provider>
		<Frame
			catches={props.link.tags.join(", ")}
			name={props.link.name}
			tone={tones[props.link.name]}
		>
			{props.children}
		</Frame>
	</props.link.Provider>
);

const nest = (links: ReadonlyArray<Link>, inside: ReactNode) =>
	links.reduceRight<ReactNode>(
		(children, link) => (
			<Mount key={link.name} link={link}>
				{children}
			</Mount>
		),
		inside,
	);

/** The app, mounted through the chain the switches make. */
function Live(props: { readonly chain: Chain; readonly config: Config }) {
	const [selected, setSelected] = useState(1);
	const outer = props.chain.links.filter((link) => link.name !== "DocAccess");
	const access = props.chain.links.filter((link) => link.name === "DocAccess");
	const page = (
		<Suspense fallback={<Loading />}>
			{props.config.dataHook ? (
				<DocPageData id={selected} />
			) : (
				<DocPageResult id={selected} />
			)}
		</Suspense>
	);
	return (
		<Suspense fallback={<Loading />}>
			<props.chain.root.Provider>
				<Frame catches="defects and the rest" name="App" tone="root">
					{nest(
						outer,
						<div className="grid gap-3 @xl:grid-cols-[11rem_minmax(0,1fr)]">
							<Suspense fallback={<Loading />}>
								<DocList onSelect={setSelected} selected={selected} />
							</Suspense>
							<div key={selected}>{nest(access, page)}</div>
						</div>,
					)}
				</Frame>
			</props.chain.root.Provider>
		</Suspense>
	);
}

/** Says when the switches make code the compiler rejects. */
const Rejected = (props: { readonly errors: number }) =>
	props.errors === 0 ? null : (
		<p
			className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm"
			role="status"
		>
			<CircleX className="mt-0.5 size-4 shrink-0 text-destructive" />
			<span>
				This combination doesn’t compile: {props.errors}{" "}
				{props.errors === 1 ? "error" : "errors"}, under the code. It runs here
				with its types erased, to show what the compiler stops.
			</span>
		</p>
	);

function EffectQueryBoundaries() {
	const config = useConfig();
	return (
		<div className="grid gap-6 @4xl:grid-cols-[minmax(0,1fr)_16rem]">
			<div className="min-w-0 space-y-3">
				<Rejected errors={errorsIn(config)} />
				<Live chain={chainOf(config)} config={config} key={idOf(config)} />
			</div>
			<aside className="grid content-start gap-6 @xl:grid-cols-2 @4xl:grid-cols-1">
				<div className="space-y-6">
					<ChaosPanel />
					<EventLog />
				</div>
				<TypesPanel />
			</aside>
			<div className="min-w-0 @4xl:col-span-2">
				<CodePanel />
			</div>
		</div>
	);
}

export default defineStandaloneDemo({
	Component: EffectQueryBoundaries,
	hint: "Break the server with the chaos switches: each failure lands in the innermost boundary that catches its tag, whose outline turns solid, and its button fixes the cause. Change which tags each boundary catches with the type switches: the app remounts with that chain, and the code under it shows what TypeScript says about it.",
	title: "Typed error boundaries over Effect RPC",
});
