import { NodeServices } from "@effect/platform-node";
import { Effect, Path } from "effect";
import { createBuilder } from "vite";

/**
 * Vitest global setup: a production build of `vite-rsc/` into its `dist/`,
 * as deployed, before any test starts. A build takes seconds, longer while
 * CI runs every workspace's tests at once, so it stays out of the test's
 * timeout. Vitest sets `NODE_ENV=test`, which builds development JSX.
 */
const buildApp = Effect.fn("buildApp")(function* () {
	const path = yield* Path.Path;
	const root = path.join(import.meta.dirname, "../vite-rsc");
	const nodeEnv = process.env["NODE_ENV"];
	process.env["NODE_ENV"] = "production";
	yield* Effect.tryPromise(async () => {
		const builder = await createBuilder({
			configFile: path.join(root, "vite.config.ts"),
			logLevel: "warn",
			root,
		});
		await builder.buildApp();
	}).pipe(
		Effect.ensuring(
			Effect.sync(() => {
				process.env["NODE_ENV"] = nodeEnv;
			}),
		),
	);
});

export default function setup(): Promise<void> {
	return Effect.runPromise(buildApp().pipe(Effect.provide(NodeServices.layer)));
}
