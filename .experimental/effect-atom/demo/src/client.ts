/**
 * The RPC client as an `AtomRpc` service: its atoms run on the client's own
 * runtime, connected to the in-browser server without serialization.
 */
import { Effect, Layer } from "effect";
import { AtomRpc } from "effect/reactivity";
import {
	RpcClient,
	RpcClientError,
	type RpcGroup,
	RpcServer,
} from "effect/rpc";
import { SocketOpenError } from "effect/socket/Socket";

import { DocRpcs } from "./api.ts";
import { getChaos } from "./chaos.ts";
import { ServerLive } from "./server.ts";

const offline = () =>
	new RpcClientError.RpcClientError({
		reason: new SocketOpenError({
			cause: "the chaos panel is offline",
			kind: "Unknown",
		}),
	});

const connect = Effect.gen(function* () {
	// oxlint-disable-next-line prefer-const -- the server answers through the client made after it
	let client!: Effect.Success<
		ReturnType<
			typeof RpcClient.makeNoSerialization<
				RpcGroup.Rpcs<typeof DocRpcs>,
				RpcClientError.RpcClientError,
				true
			>
		>
	>;
	const server = yield* RpcServer.makeNoSerialization(DocRpcs, {
		disableFatalDefects: true,
		onFromServer: (response) => client.write(response),
	});
	client = yield* RpcClient.makeNoSerialization(DocRpcs, {
		flatten: true,
		onFromClient: (options) =>
			getChaos().offline
				? Effect.fail(offline())
				: server.write(0, options.message),
		supportsAck: true,
	});
	return client.client;
}).pipe(Effect.provide(ServerLive));

export class DocsClient extends AtomRpc.Service<DocsClient>()("DocsClient", {
	group: DocRpcs,
	makeEffect: connect,
	protocol: Layer.empty,
}) {}
