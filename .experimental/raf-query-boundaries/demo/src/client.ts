/**
 * The RPC client, connected to the in-browser server without serialization,
 * and the query client whose queries and Effects use it.
 */
import { QueryClient } from "@raf-query/react";
import { Context, Effect, Layer } from "effect";
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

type Client = RpcClient.RpcClient<
	RpcGroup.Rpcs<typeof DocRpcs>,
	RpcClientError.RpcClientError
>;

export class DocsClient extends Context.Service<DocsClient, Client>()(
	"demo/DocsClient",
) {}

const offline = () =>
	new RpcClientError.RpcClientError({
		reason: new SocketOpenError({
			cause: "the chaos panel is offline",
			kind: "Unknown",
		}),
	});

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
		const server = yield* RpcServer.makeNoSerialization(DocRpcs, {
			disableFatalDefects: true,
			onFromServer: (response) => client.write(response),
		});
		client = yield* RpcClient.makeNoSerialization(DocRpcs, {
			onFromClient: (options) =>
				getChaos().offline
					? Effect.fail(offline())
					: server.write(0, options.message),
			supportsAck: true,
		});
		return client.client;
	}),
).pipe(Layer.provide(ServerLive));

export const client = new QueryClient({
	isServer: false,
	layer: DocsClientLive,
});
