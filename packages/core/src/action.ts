import type { Feature, QueryClient } from "./client.ts";
import type { Group, TagDef, Target } from "./keys.ts";
import type { QueryFactory } from "./options.ts";
import { invalidateAll, invalidateMany } from "./verbs.ts";

interface Registration {
	readonly client: QueryClient;
	readonly invalidateAfterEach: boolean;
}

const registered = new Set<Registration>();

export interface InvalidateOnActionOptions {
	/**
	 * `"active"`: after any `action()` without `invalidates`, refetch
	 * everything on screen (and mark the rest stale), the way routers rerun
	 * loaders after an action. `"none"`: only what an action names.
	 * Default `"active"`.
	 */
	readonly default?: "active" | "none";
}

/**
 * Lets `action()` bust this client's cache. Opt-in: without it, actions
 * invalidate nothing.
 */
export function invalidateOnAction(
	options: InvalidateOnActionOptions = {},
): Feature {
	return (client, signal) => {
		const registration = {
			client,
			invalidateAfterEach: (options.default ?? "active") === "active",
		};
		registered.add(registration);
		signal.addEventListener("abort", () => registered.delete(registration));
	};
}

export interface ActionOptions {
	/** What the action changes: groups, tags or factories, never raw keys. */
	readonly invalidates?: ReadonlyArray<Group | QueryFactory | TagDef<never>>;
}

/**
 * Wrap a write so the cache catches up after it. The result is a plain
 * async function, usable as a React Action (`<form action={save}>`, or in
 * `startTransition`). It resolves after the refetches it caused settle, so
 * the transition stays pending until fresh data is on screen.
 *
 * ```ts
 * const save = action(updateIssue, { invalidates: [issues] });
 * ```
 */
export function action<TArgs extends Array<unknown>, TResult>(
	write: (...args: TArgs) => Promise<TResult>,
	options: ActionOptions = {},
): (...args: TArgs) => Promise<TResult> {
	return async (...args) => {
		const result = await write(...args);
		const targets: ReadonlyArray<Target> | undefined = options.invalidates;
		await Promise.all(
			[...registered].map((registration) => {
				if (targets) {
					return Promise.all(
						targets.map((target) =>
							invalidateMany(
								registration.client,
								// SAFETY: every target kind goes through the same implementation.
								target as Group,
							),
						),
					);
				}
				return registration.invalidateAfterEach
					? invalidateAll(registration.client)
					: undefined;
			}),
		);
		return result;
	};
}
