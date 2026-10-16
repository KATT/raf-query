/**
 * The production server: the client build's files, then pages and the API.
 * `pnpm build` writes it to `dist/server/server.js`, beside `dist/client`.
 */
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Config, Effect, FileSystem, Path, Schema } from "effect";
import { Hono } from "hono";

import { createHandler } from "./server/handler.ts";

const Manifest = Schema.Record(
	Schema.String,
	Schema.Struct({
		css: Schema.optional(Schema.Array(Schema.String)),
		file: Schema.String,
	}),
);

Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const port = yield* Config.Port("PORT").pipe(Config.withDefault(3008));
	const client = path.join(import.meta.dirname, "../client");
	const manifest = yield* fs
		.readFileString(path.join(client, ".vite/manifest.json"))
		.pipe(Effect.flatMap(Schema.decodeEffect(Schema.fromJsonString(Manifest))));
	const entry = manifest["src/entry-client.ts"];
	if (!entry) {
		return yield* Effect.die("The client build has no src/entry-client.ts");
	}
	const app = new Hono()
		.use(
			"/assets/*",
			serveStatic({ root: path.relative(process.cwd(), client) }),
		)
		.route(
			"/",
			createHandler({
				scripts: [`/${entry.file}`],
				styles: (entry.css ?? []).map((file) => `/${file}`),
			}),
		);
	yield* Effect.acquireRelease(
		Effect.sync(() => serve({ fetch: app.fetch, port })),
		(server) => Effect.sync(() => server.close()),
	);
	yield* Effect.log(`Listening on http://localhost:${port}`);
	return yield* Effect.never;
}).pipe(Effect.scoped, Effect.provide(NodeServices.layer), NodeRuntime.runMain);
