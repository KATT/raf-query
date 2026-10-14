import { Button } from "@examples/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@examples/ui/components/dialog";
import { Skeleton } from "@examples/ui/components/skeleton";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@examples/ui/components/tabs";
import { cn } from "@examples/ui/lib/utils";
import { QueryClient, QueryClientProvider } from "@raf-query/react";
import { QueryDevtoolsPanel } from "@raf-query/react/devtools/production";
import { Expand, FlaskConical, RotateCcw } from "lucide-react";
import { Activity, type ReactNode, Suspense, useId, useState } from "react";

import { CachePanel } from "./cache-panel.tsx";
import type { DemoDefinition, DemoVariant } from "./define.ts";
import { NetworkPanel } from "./network-panel.tsx";
import type { FakeServer } from "./server.ts";
import { DemoSessionContext } from "./session.ts";

const latencies = [
	{ label: "Fast", ms: 250 },
	{ label: "3G", ms: 900 },
	{ label: "Slow", ms: 2500 },
] as const;

interface Session {
	readonly client: QueryClient;
	readonly id: number;
	/** Where a reloaded browser opens. */
	readonly location?: string;
}

let sessionCount = 0;
// One live session per variant, like its fake server: React can discard a
// render and run `useState`'s initializer again, and a second client would
// send the demo's first requests twice.
const liveSessions = new WeakMap<DemoVariant, Session>();

function createSession(
	demo: DemoDefinition,
	variant: DemoVariant,
	location?: string,
): Session {
	sessionCount++;
	const session = {
		client: demo.createClient?.() ?? new QueryClient(),
		id: sessionCount,
		location,
	};
	liveSessions.set(variant, session);
	return session;
}

function sessionsFor(demo: DemoDefinition): ReadonlyArray<Session> {
	return demo.variants.map(
		(variant) => liveSessions.get(variant) ?? createSession(demo, variant),
	);
}

function DemoSkeleton() {
	return (
		<div className="grid gap-3">
			<Skeleton className="h-8 w-full" />
			<Skeleton className="h-24 w-full" />
		</div>
	);
}

function Inspector(props: {
	readonly className?: string;
	readonly devtools?: boolean;
	/** The variant shown, when the demo has several. */
	readonly label?: string;
	readonly server: FakeServer<unknown>;
	readonly session: Session;
}) {
	return (
		<Tabs className={props.className} defaultValue="network">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<TabsList className="h-8">
					<TabsTrigger className="text-xs" value="network">
						Network
					</TabsTrigger>
					<TabsTrigger className="text-xs" value="cache">
						Cache
					</TabsTrigger>
					{props.devtools ? (
						<TabsTrigger className="text-xs" value="devtools">
							Devtools
						</TabsTrigger>
					) : null}
				</TabsList>
				{props.label ? (
					<p className="text-xs text-muted-foreground">
						Showing{" "}
						<span className="font-mono font-medium text-foreground">
							{props.label}
						</span>
					</p>
				) : null}
			</div>
			<TabsContent className="min-h-28" value="network">
				<NetworkPanel server={props.server} />
			</TabsContent>
			<TabsContent className="min-h-28" value="cache">
				<CachePanel client={props.session.client} />
			</TabsContent>
			{props.devtools ? (
				<TabsContent className="min-h-0" value="devtools">
					<QueryDevtoolsPanel
						client={props.session.client}
						style={{ borderRadius: 8, height: "100%", minHeight: 360 }}
						theme={
							document.documentElement.classList.contains("dark")
								? "dark"
								: "light"
						}
					/>
				</TabsContent>
			) : null}
		</Tabs>
	);
}

function VariantSwitch(props: {
	readonly demo: DemoDefinition;
	readonly onSelect: (index: number) => void;
	readonly selected: number;
}) {
	const name = useId();
	return (
		<fieldset className="flex flex-col items-start gap-1.5">
			<legend className="sr-only">{props.demo.variantsLabel}</legend>
			<div className="inline-flex flex-wrap rounded-md border p-0.5">
				{props.demo.variants.map((variant, index) => (
					<label
						className={cn(
							"cursor-pointer rounded px-2.5 py-0.5 font-mono text-xs text-muted-foreground has-focus-visible:ring-2 has-focus-visible:ring-ring",
							index === props.selected &&
								"bg-accent font-medium text-foreground",
						)}
						key={variant.label}
					>
						<input
							checked={index === props.selected}
							className="sr-only"
							name={name}
							onChange={() => {
								props.onSelect(index);
							}}
							type="radio"
						/>
						{variant.label}
					</label>
				))}
			</div>
			<p aria-live="polite" className="text-sm text-muted-foreground">
				{props.demo.variants[props.selected]?.description}
			</p>
		</fieldset>
	);
}

/**
 * The selected variant, and every variant opened since the last reset kept
 * mounted in a hidden `<Activity>`, so switching back finds its page as it
 * was left.
 */
function DemoBody(props: {
	readonly demo: DemoDefinition;
	readonly onReload: (index: number, location: string) => void;
	readonly onSelect: (index: number) => void;
	readonly opened: ReadonlyArray<number>;
	readonly selected: number;
	readonly sessions: ReadonlyArray<Session>;
}) {
	const demo = props.demo;
	return (
		<div className="flex flex-col gap-3">
			{demo.variants.length > 1 ? (
				<VariantSwitch
					demo={demo}
					onSelect={props.onSelect}
					selected={props.selected}
				/>
			) : null}
			{demo.variants.map((variant, index) => {
				const session = props.sessions[index];
				if (!session || !props.opened.includes(index)) {
					return null;
				}
				return (
					<Activity
						key={variant.label}
						mode={index === props.selected ? "visible" : "hidden"}
					>
						<QueryClientProvider client={session.client} key={session.id}>
							<DemoSessionContext
								value={{
									location: session.location,
									reload: (location) => {
										props.onReload(index, location);
									},
								}}
							>
								<Suspense fallback={<DemoSkeleton />}>
									<variant.Component />
								</Suspense>
							</DemoSessionContext>
						</QueryClientProvider>
					</Activity>
				);
			})}
		</div>
	);
}

function Toolbar(props: {
	readonly children?: ReactNode;
	readonly demo: DemoDefinition;
	readonly onReset: () => void;
}) {
	const [latency, setLatency] = useState(
		props.demo.variants[0]?.server.latency,
	);
	return (
		<div className="flex flex-wrap items-center gap-2">
			<div
				aria-label="Server latency"
				className="inline-flex rounded-md border p-0.5"
				role="radiogroup"
			>
				{latencies.map((option) => (
					<button
						aria-checked={latency === option.ms}
						className={cn(
							"rounded px-2 py-0.5 text-xs text-muted-foreground",
							latency === option.ms && "bg-accent font-medium text-foreground",
						)}
						key={option.ms}
						onClick={() => {
							for (const variant of props.demo.variants) {
								variant.server.latency = option.ms;
							}
							setLatency(option.ms);
						}}
						role="radio"
						title={`Server responds in about ${option.ms} ms`}
						type="button"
					>
						{option.label}
					</button>
				))}
			</div>
			<Button onClick={props.onReset} size="xs" variant="ghost">
				<RotateCcw /> Reset
			</Button>
			{props.children}
		</div>
	);
}

/**
 * A live demo in a box: its own query client and fake server, with the
 * server's requests and the cache's entries underneath. Expanding it opens
 * the same session in a dialog with the devtools panel. A demo with
 * variants gets a switch, and a session per variant; Reset starts them all
 * over and keeps the switch where it is. A browser's Reload starts only its
 * own variant over, on the URL it was showing.
 */
export function DemoFrame(props: { readonly demo: DemoDefinition }) {
	const demo = props.demo;
	const [sessions, setSessions] = useState(() => sessionsFor(demo));
	const [selected, setSelected] = useState(0);
	const [opened, setOpened] = useState<ReadonlyArray<number>>([0]);
	const [expanded, setExpanded] = useState(false);
	const variant = demo.variants[selected];
	const session = sessions[selected];
	if (!variant || !session) {
		throw new Error(`Demo "${demo.title}" has no variant ${selected}`);
	}
	const reset = () => {
		for (const previous of sessions) {
			void previous.client.dispose();
		}
		for (const each of demo.variants) {
			each.server.reset();
		}
		setSessions(demo.variants.map((each) => createSession(demo, each)));
		setOpened([selected]);
	};
	const inspected = {
		label: demo.variants.length > 1 ? variant.label : undefined,
		server: variant.server,
		session,
	};
	const body = (
		<DemoBody
			demo={demo}
			onReload={(index, location) => {
				const reloaded = demo.variants[index];
				if (!reloaded) {
					return;
				}
				void sessions[index]?.client.dispose();
				reloaded.server.reset();
				setSessions((previous) =>
					previous.map((each, at) =>
						at === index ? createSession(demo, reloaded, location) : each,
					),
				);
			}}
			onSelect={(index) => {
				setSelected(index);
				setOpened((previous) =>
					previous.includes(index) ? previous : [...previous, index],
				);
			}}
			opened={opened}
			selected={selected}
			sessions={sessions}
		/>
	);

	return (
		<figure className="not-prose my-8 overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm">
			<figcaption className="grid gap-1.5 border-b px-4 py-3">
				<div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
					<p className="flex items-center gap-2 text-sm font-semibold">
						<FlaskConical className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
						{demo.title}
					</p>
					<Toolbar demo={demo} onReset={reset}>
						<Button
							onClick={() => {
								setExpanded(true);
							}}
							size="xs"
							variant="outline"
						>
							<Expand /> Expand
						</Button>
					</Toolbar>
				</div>
				<p className="text-xs text-muted-foreground">{demo.hint}</p>
			</figcaption>
			<div className="p-4">
				{expanded ? (
					<p className="py-10 text-center text-sm text-muted-foreground">
						Running in the expanded view.
					</p>
				) : (
					body
				)}
			</div>
			<Inspector className="border-t bg-muted/30 px-4 py-3" {...inspected} />
			<Dialog onOpenChange={setExpanded} open={expanded}>
				<DialogContent className="grid h-[min(56rem,92dvh)] w-[96vw] max-w-none grid-rows-[auto_1fr] gap-4 overflow-hidden p-5 sm:max-w-7xl">
					<div className="grid gap-2 pr-8">
						<DialogTitle className="flex items-center gap-2">
							<FlaskConical className="size-4 text-emerald-600 dark:text-emerald-400" />
							{demo.title}
						</DialogTitle>
						<DialogDescription>{demo.hint}</DialogDescription>
						<Toolbar demo={demo} onReset={reset} />
					</div>
					<div className="grid min-h-0 gap-4 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
						<div className="min-w-0">{body}</div>
						<Inspector
							className="min-w-0 rounded-lg border bg-muted/30 p-3"
							devtools
							{...inspected}
						/>
					</div>
				</DialogContent>
			</Dialog>
		</figure>
	);
}
