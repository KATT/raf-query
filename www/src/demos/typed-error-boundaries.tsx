import { Button } from "@examples/ui/components/button";
import { Switch } from "@examples/ui/components/switch";
import { cn } from "@examples/ui/lib/utils";
import {
	QueryClient,
	type QueryHandle,
	queryOptions,
	useQueryClient,
	useWaterfall,
} from "@raf-query/react";
import { Boundary } from "@raf-query/react/boundary";
import { Cause, Context, Effect, Layer, Match, Result, Schema } from "effect";
import {
	Rpc,
	RpcClient,
	RpcClientError,
	RpcGroup,
	RpcMiddleware,
	RpcServer,
} from "effect/rpc";
import { SocketOpenError } from "effect/socket/Socket";
import {
	type ReactNode,
	Suspense,
	useState,
	useSyncExternalStore,
} from "react";

import { defineDemo } from "~/demo-kit/define.ts";
import { createFakeServer } from "~/demo-kit/server.ts";

// The API: an Effect RPC group. Every procedure needs a session.

class Unauthorized extends Schema.TaggedError<Unauthorized>()(
	"Unauthorized",
	{},
) {}

class Forbidden extends Schema.TaggedError<Forbidden>()("Forbidden", {
	docId: Schema.Int,
}) {}

class DocNotFound extends Schema.TaggedError<DocNotFound>()("DocNotFound", {
	docId: Schema.Int,
}) {}

const Doc = Schema.Struct({
	body: Schema.String,
	id: Schema.Int,
	title: Schema.String,
});

class Session extends RpcMiddleware.Service<Session>()("demo/Session", {
	error: Unauthorized,
}) {}

const DocRpcs = RpcGroup.make(
	Rpc.make("ListDocs", { success: Schema.Array(Doc) }),
	Rpc.make("GetDoc", {
		error: Schema.Union([Forbidden, DocNotFound]),
		payload: { id: Schema.Int },
		success: Doc,
	}),
).middleware(Session);

// What the switches change. The handlers and the transport read it on every call.

interface Chaos {
	readonly deleted: ReadonlySet<number>;
	readonly locked: ReadonlySet<number>;
	readonly offline: boolean;
	readonly serverBug: boolean;
	readonly signedIn: boolean;
}

let chaos: Chaos = {
	deleted: new Set(),
	locked: new Set([3]),
	offline: false,
	serverBug: false,
	signedIn: true,
};
const chaosListeners = new Set<() => void>();

function setChaos(patch: Partial<Chaos>) {
	chaos = { ...chaos, ...patch };
	for (const listener of chaosListeners) {
		listener();
	}
}

function toggle(set: ReadonlySet<number>, id: number): ReadonlySet<number> {
	const next = new Set(set);
	if (!next.delete(id)) {
		next.add(id);
	}
	return next;
}

function subscribeChaos(listener: () => void) {
	chaosListeners.add(listener);
	return () => {
		chaosListeners.delete(listener);
	};
}

const server = createFakeServer(() => ({
	docs: [
		{
			body: "Boundaries are catchTags over the tree.",
			id: 1,
			title: "Design notes",
		},
		{
			body: "A failure goes to the innermost boundary that catches it.",
			id: 2,
			title: "Routing",
		},
		{
			body: "Only the payroll team can read this one.",
			id: 3,
			title: "Salaries",
		},
	],
}));

const Handlers = DocRpcs.toLayer({
	GetDoc: (payload) =>
		Effect.gen(function* () {
			const doc = yield* Effect.promise((signal) =>
				server.respond(
					`GetDoc(${payload.id})`,
					(db) => db.docs.find((each) => each.id === payload.id),
					{ signal },
				),
			);
			if (chaos.serverBug) {
				return yield* Effect.die(
					new Error(`GetDoc(${payload.id}): the row failed to decode`),
				);
			}
			if (chaos.locked.has(payload.id)) {
				return yield* new Forbidden({ docId: payload.id });
			}
			if (doc === undefined || chaos.deleted.has(payload.id)) {
				return yield* new DocNotFound({ docId: payload.id });
			}
			return doc;
		}),
	ListDocs: () =>
		Effect.promise((signal) =>
			server.respond(
				"ListDocs",
				(db) => db.docs.filter((doc) => !chaos.deleted.has(doc.id)),
				{ signal },
			),
		),
});

const SessionLive = Layer.succeed(Session, (effect) =>
	chaos.signedIn ? effect : Effect.fail(new Unauthorized()),
);

type Client = RpcClient.RpcClient<
	RpcGroup.Rpcs<typeof DocRpcs>,
	RpcClientError.RpcClientError
>;

class DocsClient extends Context.Service<DocsClient, Client>()(
	"demo/DocsClient",
) {}

/** The server and the client in the page, without serialization. */
const DocsClientLive = Layer.effect(
	DocsClient,
	Effect.gen(function* () {
		// oxlint-disable-next-line prefer-const -- the server answers through the client made after it
		let client!: Effect.Success<
			ReturnType<
				typeof RpcClient.makeNoSerialization<
					RpcGroup.Rpcs<typeof DocRpcs>,
					RpcClientError.RpcClientError
				>
			>
		>;
		const rpcServer = yield* RpcServer.makeNoSerialization(DocRpcs, {
			disableFatalDefects: true,
			onFromServer: (response) => client.write(response),
		});
		client = yield* RpcClient.makeNoSerialization(DocRpcs, {
			onFromClient: (options) =>
				chaos.offline
					? Effect.fail(
							new RpcClientError.RpcClientError({
								reason: new SocketOpenError({
									cause: "the demo is offline",
									kind: "Unknown",
								}),
							}),
						)
					: rpcServer.write(0, options.message),
			supportsAck: true,
		});
		return client.client;
	}),
).pipe(Layer.provide(Layer.merge(Handlers, SessionLive)));

// The queries. Their error types are the RPC client's.

function docListQuery() {
	return queryOptions({
		queryFn: () => Effect.flatMap(DocsClient, (docs) => docs.ListDocs()),
		queryKey: ["docs"],
		retry: false,
	});
}

function docQuery(input: { readonly id: number }) {
	return queryOptions({
		queryFn: () =>
			Effect.flatMap(DocsClient, (docs) => docs.GetDoc({ id: input.id })),
		queryKey: ["docs", input.id],
		retry: false,
	});
}

// Who caught what. A fallback logs when it mounts, once per failure.

interface Caught {
	readonly by: string;
	readonly id: number;
	readonly what: string;
}

/** What a fallback gets: the root's Cause, or a boundary's typed failure. */
type Failure =
	| Cause.Cause<unknown>
	| Forbidden
	| RpcClientError.RpcClientError
	| Unauthorized;

let caught: ReadonlyArray<Caught> = [];
let nextCaught = 0;
const logged = new WeakSet<Failure>();
const logListeners = new Set<() => void>();

function logCaught(failure: Failure, by: string, what: string) {
	if (logged.has(failure)) {
		return;
	}
	logged.add(failure);
	caught = [{ by, id: nextCaught++, what }, ...caught].slice(0, 8);
	for (const listener of logListeners) {
		listener();
	}
}

function subscribeLog(listener: () => void) {
	logListeners.add(listener);
	return () => {
		logListeners.delete(listener);
	};
}

// The boundaries, from the outside in.

type Tone = "access" | "inline" | "network" | "root" | "session";

const tones = {
	access: "border-sky-500/60 text-sky-700 dark:text-sky-300",
	inline: "border-emerald-500/60 text-emerald-700 dark:text-emerald-300",
	network: "border-amber-500/60 text-amber-700 dark:text-amber-300",
	root: "border-zinc-400/70 text-zinc-600 dark:text-zinc-300",
	session: "border-violet-500/60 text-violet-700 dark:text-violet-300",
} satisfies { readonly [K in Tone]: string };

/** A boundary's outline while its children render. */
function Outline(props: {
	readonly catches: string;
	readonly children: ReactNode;
	readonly name: string;
	readonly tone: Tone;
}) {
	return (
		<section
			className={cn(
				"relative rounded-lg border-2 border-dashed px-2.5 pt-6 pb-2.5",
				tones[props.tone],
			)}
		>
			<span className="absolute top-1.5 left-2.5 font-mono text-[11px] leading-none">
				<strong>{props.name}</strong> catches {props.catches}
			</span>
			<div className="text-foreground">{props.children}</div>
		</section>
	);
}

/** A fallback: the outline turns solid and says what it caught. */
function CaughtBox(props: {
	readonly action?: ReactNode;
	readonly children: ReactNode;
	readonly failure: Failure;
	readonly name: string;
	readonly tone: Tone;
	readonly what: string;
}) {
	return (
		<section
			className={cn(
				"relative grid gap-2 rounded-lg border-2 bg-destructive/5 px-3 pt-6 pb-3",
				tones[props.tone],
			)}
			// A ref runs once the fallback is on screen; a render can be discarded.
			ref={() => {
				logCaught(props.failure, props.name, props.what);
			}}
			role="alert"
		>
			<span className="absolute top-1.5 left-3 font-mono text-[11px] leading-none">
				<strong>{props.name}</strong> caught <strong>{props.what}</strong>
			</span>
			<div className="grid justify-items-start gap-2 text-sm text-foreground">
				{props.children}
				{props.action}
			</div>
		</section>
	);
}

function Crashed(props: Boundary.RootFallbackProps) {
	const what = Cause.hasDies(props.cause) ? "a defect" : "an interrupt";
	return (
		<CaughtBox
			action={
				<Button
					onClick={() => {
						setChaos({ serverBug: false });
						props.retry();
					}}
					size="xs"
				>
					Fix the server and retry
				</Button>
			}
			failure={props.cause}
			name="App"
			tone="root"
			what={what}
		>
			<p>
				A defect isn&apos;t in any error type, so it skipped every typed
				boundary.
			</p>
			<pre className="max-w-full overflow-x-auto rounded bg-muted p-2 font-mono text-xs">
				{Cause.pretty(props.cause).split("\n")[0]}
			</pre>
		</CaughtBox>
	);
}

function Offline(props: Boundary.FallbackProps<RpcClientError.RpcClientError>) {
	return (
		<CaughtBox
			action={
				<Button
					onClick={() => {
						setChaos({ offline: false });
						props.retry();
					}}
					size="xs"
				>
					Reconnect
				</Button>
			}
			failure={props.error}
			name="Network"
			tone="network"
			what="RpcClientError"
		>
			<p>Can&apos;t reach the server.</p>
		</CaughtBox>
	);
}

function SignIn(props: Boundary.FallbackProps<Unauthorized>) {
	return (
		<CaughtBox
			action={
				<Button
					onClick={() => {
						setChaos({ signedIn: true });
						props.retry();
					}}
					size="xs"
				>
					Sign in
				</Button>
			}
			failure={props.error}
			name="Session"
			tone="session"
			what="Unauthorized"
		>
			<p>Your session ended. Every query in here needs one.</p>
		</CaughtBox>
	);
}

function RequestAccess(props: Boundary.FallbackProps<Forbidden>) {
	return (
		<CaughtBox
			action={
				<Button
					onClick={() => {
						setChaos({ locked: toggle(chaos.locked, props.error.docId) });
						props.retry();
					}}
					size="xs"
				>
					Grant access
				</Button>
			}
			failure={props.error}
			name="DocAccess"
			tone="access"
			what="Forbidden"
		>
			<p>You don&apos;t have access to doc {props.error.docId}.</p>
		</CaughtBox>
	);
}

const [App] = Boundary.root<DocsClient>({ fallback: Crashed, name: "App" });

const [Network] = Boundary.catchErrors(App, {
	errors: [RpcClientError.RpcClientError],
	fallback: Offline,
	name: "Network",
});

const [SessionBoundary, useSession] = Boundary.catchErrors(Network, {
	errors: [Unauthorized],
	fallback: SignIn,
	name: "Session",
});

const [DocAccess] = Boundary.catchErrors(SessionBoundary, {
	errors: [Forbidden],
	fallback: RequestAccess,
	name: "DocAccess",
});

// The page.

function TypeChip(props: { readonly children: string }) {
	return (
		<code className="block w-fit rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
			{props.children}
		</code>
	);
}

function DocList(props: {
	readonly list: QueryHandle<typeof docListQuery>;
	readonly onSelect: (id: number) => void;
	readonly selected: number;
}) {
	// The chain catches everything ListDocs can fail with: plain data.
	const docs = useSession(docListQuery, props.list);
	return (
		<nav className="grid content-start gap-1.5">
			<TypeChip>useSession(…): Doc[]</TypeChip>
			<ul className="grid gap-0.5 text-sm">
				{[...docs, { id: 99, title: "A doc that doesn’t exist" }].map((doc) => (
					<li key={doc.id}>
						<button
							className={cn(
								"w-full rounded px-2 py-1 text-left hover:bg-muted",
								props.selected === doc.id && "bg-muted font-medium",
							)}
							onClick={() => {
								props.onSelect(doc.id);
							}}
							type="button"
						>
							{doc.title}
						</button>
					</li>
				))}
			</ul>
		</nav>
	);
}

function DocPage(props: { readonly doc: QueryHandle<typeof docQuery> }) {
	// Forbidden, Unauthorized and RpcClientError go to boundaries: DocNotFound is left.
	const doc = DocAccess.useResult(docQuery, props.doc);
	return (
		<div className="grid gap-2">
			<TypeChip>
				DocAccess.useResult(…): Result&lt;Doc, DocNotFound&gt;
			</TypeChip>
			{Result.isSuccess(doc) ? (
				<article className="grid gap-1">
					<h3 className="font-semibold">{doc.success.title}</h3>
					<p className="text-sm text-muted-foreground">{doc.success.body}</p>
				</article>
			) : (
				<section
					className={cn(
						"rounded-lg border-2 bg-emerald-500/5 px-3 py-2 text-sm",
						tones.inline,
					)}
				>
					<span className="text-foreground">
						{Match.valueTags(doc.failure, {
							DocNotFound: (missing) =>
								`Doc ${missing.docId} doesn’t exist: no boundary catches DocNotFound, so this component matched it.`,
						})}
					</span>
				</section>
			)}
		</div>
	);
}

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
	const current = useSyncExternalStore(
		subscribeChaos,
		() => chaos,
		() => chaos,
	);
	const events = useSyncExternalStore(
		subscribeLog,
		() => caught,
		() => caught,
	);
	// A reset, not an invalidate: a refetch that fails keeps its data on
	// screen, and only a load with nothing to show goes to a boundary.
	const change = (patch: Partial<Chaos>) => {
		setChaos(patch);
		void client.reset({});
	};
	return (
		<aside className="grid content-start gap-4">
			<div className="grid gap-2.5">
				<p className="text-xs font-medium">Break it</p>
				<ChaosSwitch
					checked={!current.signedIn}
					hint="Unauthorized"
					label="Sign out"
					onChange={(checked) => {
						change({ signedIn: !checked });
					}}
				/>
				<ChaosSwitch
					checked={current.offline}
					hint="RpcClientError"
					label="Go offline"
					onChange={(checked) => {
						change({ offline: checked });
					}}
				/>
				<ChaosSwitch
					checked={current.serverBug}
					hint="GetDoc dies: a defect"
					label="Server bug"
					onChange={(checked) => {
						change({ serverBug: checked });
					}}
				/>
				<ChaosSwitch
					checked={current.locked.has(2)}
					hint="Forbidden for Routing"
					label="Lock doc 2"
					onChange={() => {
						change({ locked: toggle(current.locked, 2) });
					}}
				/>
				<ChaosSwitch
					checked={current.deleted.has(1)}
					hint="DocNotFound for Design notes"
					label="Delete doc 1"
					onChange={() => {
						change({ deleted: toggle(current.deleted, 1) });
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

function Loading() {
	return <p className="text-sm text-muted-foreground">Loading…</p>;
}

function Docs() {
	const [selected, setSelected] = useState(1);
	const list = useWaterfall(docListQuery);
	const doc = useWaterfall(docQuery, { id: selected });
	return (
		<div className="grid gap-4 @2xl:grid-cols-[minmax(0,1fr)_12rem]">
			<App>
				<Outline catches="defects" name="App" tone="root">
					<Network>
						<Outline catches="RpcClientError" name="Network" tone="network">
							<SessionBoundary>
								<Outline catches="Unauthorized" name="Session" tone="session">
									<div className="grid gap-3 @lg:grid-cols-[10rem_minmax(0,1fr)]">
										<Suspense fallback={<Loading />}>
											<DocList
												list={list}
												onSelect={setSelected}
												selected={selected}
											/>
										</Suspense>
										<DocAccess key={selected}>
											<Outline
												catches="Forbidden"
												name="DocAccess"
												tone="access"
											>
												<Suspense fallback={<Loading />}>
													<DocPage doc={doc} />
												</Suspense>
											</Outline>
										</DocAccess>
									</div>
								</Outline>
							</SessionBoundary>
						</Outline>
					</Network>
				</Outline>
			</App>
			<Panel />
		</div>
	);
}

export default defineDemo({
	Component: Docs,
	createClient: () => new QueryClient({ layer: DocsClientLive }),
	hint: "Flip a switch: each failure lands on the boundary that catches it, and its fallback fixes the server and retries. Salaries starts locked.",
	server,
	title: "Typed error boundaries",
});
