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
import { type ReactNode, Suspense, useState } from "react";

import { CachePanel } from "./cache-panel.tsx";
import type { DemoDefinition } from "./define.ts";
import { NetworkPanel } from "./network-panel.tsx";

const latencies = [
	{ label: "Fast", ms: 250 },
	{ label: "3G", ms: 900 },
	{ label: "Slow", ms: 2500 },
] as const;

interface Session {
	readonly client: QueryClient;
	readonly id: number;
}

let sessions = 0;
// One live session per demo, like its fake server: React can discard a
// render and run `useState`'s initializer again, and a second client would
// send the demo's first requests twice.
const liveSessions = new WeakMap<DemoDefinition, Session>();

function createSession(demo: DemoDefinition): Session {
	sessions++;
	const session = {
		client: demo.createClient?.() ?? new QueryClient(),
		id: sessions,
	};
	liveSessions.set(demo, session);
	return session;
}

function sessionFor(demo: DemoDefinition): Session {
	return liveSessions.get(demo) ?? createSession(demo);
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
	readonly demo: DemoDefinition;
	readonly devtools?: boolean;
	readonly session: Session;
}) {
	return (
		<Tabs className={props.className} defaultValue="network">
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
			<TabsContent className="min-h-28" value="network">
				<NetworkPanel server={props.demo.server} />
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

function DemoBody(props: {
	readonly demo: DemoDefinition;
	readonly session: Session;
}) {
	const Component = props.demo.Component;
	return (
		<QueryClientProvider client={props.session.client} key={props.session.id}>
			<Suspense fallback={<DemoSkeleton />}>
				<Component />
			</Suspense>
		</QueryClientProvider>
	);
}

function Toolbar(props: {
	readonly children?: ReactNode;
	readonly demo: DemoDefinition;
	readonly onReset: () => void;
}) {
	const [latency, setLatency] = useState(props.demo.server.latency);
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
							props.demo.server.latency = option.ms;
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
 * the same session in a dialog with the devtools panel.
 */
export function DemoFrame(props: { readonly demo: DemoDefinition }) {
	const demo = props.demo;
	const [session, setSession] = useState(() => sessionFor(demo));
	const [expanded, setExpanded] = useState(false);
	const reset = () => {
		void session.client.dispose();
		demo.server.reset();
		setSession(createSession(demo));
	};

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
					<DemoBody demo={demo} session={session} />
				)}
			</div>
			<Inspector
				className="border-t bg-muted/30 px-4 py-3"
				demo={demo}
				session={session}
			/>
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
						<div className="min-w-0">
							<DemoBody demo={demo} session={session} />
						</div>
						<Inspector
							className="min-w-0 rounded-lg border bg-muted/30 p-3"
							demo={demo}
							devtools
							session={session}
						/>
					</div>
				</DialogContent>
			</Dialog>
		</figure>
	);
}
