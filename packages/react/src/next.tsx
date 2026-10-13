"use client";

import { type DehydratedQuery, hashKey } from "@raf-query/core";
import { useServerInsertedHTML } from "next/navigation";
import { type ReactNode, Suspense, use, useState } from "react";

import {
	dehydrate,
	hydrate,
	QueryClient,
	type QueryClientConfig,
} from "./client.ts";
import { QueryClientProvider } from "./provider.tsx";
import { sentHashes } from "./sent.ts";

/**
 * An entry in a script chunk. A pending entry's `promise` is an id instead,
 * which a later chunk settles.
 */
interface StreamedQuery extends Omit<DehydratedQuery, "promise"> {
	readonly promise?: number;
}

/** A streamed promise's outcome; a rejection carries only the message. */
type Settled =
	| { readonly data?: unknown; readonly id: number }
	| { readonly error: string; readonly id: number };

/** What one inline script pushes. */
interface StreamChunk {
	readonly queries: ReadonlyArray<StreamedQuery>;
	readonly settled?: ReadonlyArray<Settled>;
}

declare global {
	/** Chunks streamed by `QueryProvider` during SSR, until the browser client takes over. */
	var RAF_QUERY_SSR: { push(chunk: StreamChunk): void } | undefined;
}

const noop = () => {};

function escapeJson(json: string) {
	return json
		.replaceAll("<", String.raw`\u003c`)
		.replaceAll("\u2028", String.raw`\u2028`)
		.replaceAll("\u2029", String.raw`\u2029`);
}

function errorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

/** A streamed promise the browser is waiting on. */
interface Pending {
	readonly hash: string;
	reject(error: Error): void;
	resolve(data: unknown): void;
}

/** The chunks this page received, and the clients following it. */
interface PageStream {
	readonly chunks: Array<StreamChunk>;
	readonly global: { push(chunk: StreamChunk): void };
	readonly receivers: Set<(chunk: StreamChunk) => void>;
}

let page: PageStream | undefined;

/** Take over `RAF_QUERY_SSR` from the inline scripts, once per page. */
function pageStream(): PageStream {
	if (page && globalThis.RAF_QUERY_SSR === page.global) {
		return page;
	}
	const queued = globalThis.RAF_QUERY_SSR;
	const chunks: Array<StreamChunk> = Array.isArray(queued) ? [...queued] : [];
	const receivers = new Set<(chunk: StreamChunk) => void>();
	const global = {
		push(chunk: StreamChunk) {
			chunks.push(chunk);
			for (const receive of receivers) {
				receive(chunk);
			}
		},
	};
	globalThis.RAF_QUERY_SSR = global;
	page = { chunks, global, receivers };
	return page;
}

/**
 * Hydrate what SSR streamed so far, then every later chunk on arrival.
 * React can create more than one client before it keeps one (Strict Mode,
 * or a first render that suspends), so each replays the page's chunks. A
 * promise the response ended without settling (its query started after the
 * server's last wait) rejects, so its readers' error boundaries can retry.
 */
function receiveStream(client: QueryClient) {
	const stream = pageStream();
	const pending = new Map<number, Pending>();
	const receive = (chunk: StreamChunk) => {
		const queries = chunk.queries.map(({ promise: id, ...query }) => {
			if (id === undefined) {
				return query;
			}
			const promise = new Promise<unknown>((resolve, reject) => {
				pending.set(id, { hash: hashKey(query.key), reject, resolve });
			});
			promise.catch(noop);
			return { ...query, promise };
		});
		hydrate(client, { queries });
		for (const settled of chunk.settled ?? []) {
			const promised = pending.get(settled.id);
			pending.delete(settled.id);
			if ("error" in settled) {
				promised?.reject(new Error(settled.error));
			} else {
				promised?.resolve(settled.data);
			}
		}
	};
	for (const chunk of stream.chunks) {
		receive(chunk);
	}
	const abandon = () => {
		stream.receivers.delete(receive);
		for (const promised of pending.values()) {
			promised.reject(
				new Error(
					`Query ${promised.hash} was still loading when the server's response ended`,
				),
			);
		}
		pending.clear();
	};
	if (document.readyState === "loading") {
		stream.receivers.add(receive);
		document.addEventListener("DOMContentLoaded", abandon, { once: true });
	} else {
		abandon();
	}
}

/** Promises a server client streamed, and outcomes not yet sent. */
interface ServerStream {
	idle?: Promise<void>;
	nextId: number;
	readonly settled: Array<Settled>;
}

const streams = new WeakMap<QueryClient, ServerStream>();

function serverStream(client: QueryClient): ServerStream {
	let stream = streams.get(client);
	if (!stream) {
		stream = { nextId: 0, settled: [] };
		streams.set(client, stream);
	}
	return stream;
}

function streamQuery(
	stream: ServerStream,
	{ promise, ...query }: DehydratedQuery,
): StreamedQuery {
	if (!promise) {
		return query;
	}
	const id = stream.nextId++;
	promise.then(
		(data) => stream.settled.push({ data, id }),
		(error: unknown) => stream.settled.push({ error: errorMessage(error), id }),
	);
	return { ...query, promise: id };
}

/**
 * Streams entries that client components loaded during SSR (`useWaterfall`)
 * into the HTML, ahead of the markup that reads them. Entries still loading
 * cross as a promise id; a later script settles it. Entries that arrived
 * through `HydrationBoundary` are skipped: the RSC payload carries them.
 * Data must be JSON-serializable.
 */
function useServerStream(client: QueryClient) {
	useServerInsertedHTML(() => {
		const stream = serverStream(client);
		const state = dehydrate(client, { sent: sentHashes(client) });
		const queries = state.queries.map((query) => streamQuery(stream, query));
		const settled = stream.settled.splice(0);
		if (queries.length === 0 && settled.length === 0) {
			return null;
		}
		const chunk: StreamChunk = { queries, settled };
		const json = escapeJson(JSON.stringify(chunk));
		return (
			<script
				dangerouslySetInnerHTML={{
					__html: `(self.RAF_QUERY_SSR=self.RAF_QUERY_SSR||[]).push(${json})`,
				}}
			/>
		);
	});
}

/** Resolves once the client has no request in flight. */
function whenIdle(client: QueryClient): Promise<void> {
	const stream = serverStream(client);
	stream.idle ??= new Promise((resolve) => {
		const unsubscribe = client.subscribe(() => {
			if (client.isFetching() === 0) {
				unsubscribe();
				stream.idle = undefined;
				resolve();
			}
		});
	});
	return stream.idle;
}

/**
 * Keeps the server's HTML open until its client has no request in flight,
 * so every promise `useServerStream` sent settles in a later script, as the
 * RSC payload does for its own. A request can start while React retries
 * this component after a wait, so it checks again in a fresh child (a retry
 * reuses the promise it suspended on). Renders nothing.
 */
function AwaitRequests(props: { readonly client: QueryClient }) {
	const client = props.client;
	if (!client.isServer || client.isFetching() === 0) {
		return null;
	}
	use(whenIdle(client));
	return <AwaitRequests client={client} />;
}

/**
 * The query client provider for Next.js App Router. Creates one client per
 * request during SSR and one per tab in the browser.
 *
 * ```tsx
 * // app/layout.tsx
 * <QueryProvider>{props.children}</QueryProvider>
 * ```
 */
export function QueryProvider(props: {
	readonly children?: ReactNode;
	/** Options for the client it creates. */
	readonly config?: QueryClientConfig;
}) {
	const config = props.config;
	const [client] = useState(() => {
		const created = new QueryClient(config);
		if (!created.isServer) {
			receiveStream(created);
		}
		return created;
	});
	useServerStream(client);
	return (
		<QueryClientProvider client={client}>
			{props.children}
			<Suspense fallback={null}>
				<AwaitRequests client={client} />
			</Suspense>
		</QueryClientProvider>
	);
}
