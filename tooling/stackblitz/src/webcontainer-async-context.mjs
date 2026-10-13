/**
 * StackBlitz runs Node in the browser (WebContainers), where AsyncLocalStorage
 * loses its store across native `await`. Next.js and TanStack Start keep each
 * request's context in one, so their server code fails after its first
 * `await`. This preload, loaded through `NODE_OPTIONS` in `.stackblitzrc`,
 * makes `getStore()` fall back to the store last entered on that instance,
 * which is right while requests don't overlap. Outside WebContainers it does
 * nothing.
 */
import asyncHooks from "node:async_hooks";
import module from "node:module";

if (process.versions.webcontainer !== undefined) {
	const Native = asyncHooks.AsyncLocalStorage;
	const lastEntered = Symbol("lastEntered");

	class AsyncLocalStorage extends Native {
		[lastEntered] = undefined;

		enterWith(store) {
			this[lastEntered] = store;
			super.enterWith(store);
		}

		getStore() {
			return super.getStore() ?? this[lastEntered];
		}

		run(store, callback, ...args) {
			this[lastEntered] = store;
			return super.run(store, callback, ...args);
		}
	}

	// A getter-only property in recent Node.
	Object.defineProperty(asyncHooks, "AsyncLocalStorage", {
		configurable: true,
		enumerable: true,
		value: AsyncLocalStorage,
		writable: true,
	});
	globalThis.AsyncLocalStorage = AsyncLocalStorage;
	module.syncBuiltinESMExports();

	// Child processes (the dev server's workers, package scripts) may start
	// in another directory, so they get this file by absolute URL.
	const self = `--import=${import.meta.url}`;
	const options = (process.env.NODE_OPTIONS ?? "")
		.split(" ")
		.filter(
			(option) =>
				option !== "" && !option.endsWith("/webcontainer-async-context.mjs"),
		);
	process.env.NODE_OPTIONS = [...options, self].join(" ");
}
