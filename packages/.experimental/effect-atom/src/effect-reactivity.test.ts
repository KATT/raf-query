import { Schema } from "effect";
import { Atom, AtomRegistry, Hydration } from "effect/reactivity";
import { describe, expect, test } from "vitest";

// What `effect/reactivity` does on its own, where this package needs
// something else. If one of these starts failing after an Effect upgrade,
// the workaround it explains may be removable.
describe("effect/reactivity at effect@4.0.1", () => {
	test("Hydration replaces newer data with an older snapshot", () => {
		const count = Atom.make(0).pipe(
			Atom.serializable({ key: "count", schema: Schema.Number }),
		);
		const server = AtomRegistry.make();
		server.set(count, 1);
		const sent = Hydration.dehydrate(server);

		const browser = AtomRegistry.make();
		const unmount = browser.mount(count);
		browser.set(count, 2);
		Hydration.hydrate(browser, sent);

		// hydrate.ts keeps the newer value instead (`hydrateUnsafe`).
		expect(browser.get(count)).toBe(1);
		unmount();
	});

	test("refreshing an unread node leaves it stale until the next read", () => {
		let builds = 0;
		const counter = Atom.make(() => ++builds);
		const registry = AtomRegistry.make();
		registry.get(counter);

		registry.refresh(counter);

		// entry.ts flags unread entries `invalidated` instead of refreshing them.
		expect(registry.getNodes().get(counter)?.currentState()).toBe("stale");
		expect(builds).toBe(1);
	});
});
