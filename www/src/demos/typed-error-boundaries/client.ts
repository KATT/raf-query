import { Context, Effect, Layer } from "effect";
import {
	RpcClient,
	RpcClientError,
	type RpcGroup,
	RpcServer,
} from "effect/rpc";
import { SocketOpenError } from "effect/socket/Socket";

import { createFakeServer } from "~/demo-kit/server.ts";

import {
	DocNotFound,
	DocRpcs,
	Forbidden,
	Session,
	Unauthorized,
} from "./api.ts";
import { getChaos } from "./chaos.ts";

export const server = createFakeServer(() => ({
	docs: [
		{
			body: "Boundaries are catchTags over the tree.",
			id: 1,
			title: "Design notes",
		},
		{
			body: "A failure goes to the innermost boundary that lists its tag.",
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
			const chaos = getChaos();
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
				(db) => db.docs.filter((doc) => !getChaos().deleted.has(doc.id)),
				{ signal },
			),
		),
});

const SessionLive = Layer.succeed(Session, (effect) =>
	getChaos().signedIn ? effect : Effect.fail(new Unauthorized()),
);

type Client = RpcClient.RpcClient<
	RpcGroup.Rpcs<typeof DocRpcs>,
	RpcClientError.RpcClientError
>;

export class DocsClient extends Context.Service<DocsClient, Client>()(
	"demo/DocsClient",
) {}

/** The server and the client in the page, without serialization. */
export const DocsClientLive = Layer.effect(
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
				getChaos().offline
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
