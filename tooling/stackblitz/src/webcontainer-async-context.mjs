/**
 * StackBlitz runs Node in the browser (WebContainers), where AsyncLocalStorage
 * loses its store across native `await`. Next.js and TanStack Start keep each
 * request's context in one, so their server code fails after its first
 * `await`. This preload, loaded through `NODE_OPTIONS` in `.stackblitzrc`,
 * makes `getStore()` fall back to the store last entered on that instance,
 * which is right while requests don't overlap, so it also has each HTTP
 * server handle one request at a time. Outside WebContainers it leaves both
 * alone.
 */
import asyncHooks from "node:async_hooks";
import http from "node:http";
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

	// A response still open after this long (a stream that never ends) lets
	// the next request in.
	const turnLimit = 10_000;
	const turns = new WeakMap();
	const emit = http.Server.prototype.emit;
	http.Server.prototype.emit = function (event, ...args) {
		if (event !== "request") {
			return emit.call(this, event, ...args);
		}
		const response = args[1];
		const previous = turns.get(this) ?? Promise.resolve();
		const turn = new Promise((release) => {
			response.once("close", release);
			response.once("finish", release);
			void previous.then(() => {
				setTimeout(release, turnLimit).unref?.();
				emit.call(this, event, ...args);
			});
		});
		turns.set(this, turn);
		return true;
	};
}

// Package scripts run in the package's directory, where `.stackblitzrc`'s
// relative path doesn't resolve, so child processes get this file by URL.
const self = `--import=${import.meta.url}`;
const options = (process.env.NODE_OPTIONS ?? "")
	.split(" ")
	.filter(
		(option) =>
			option !== "" && !option.endsWith("/webcontainer-async-context.mjs"),
	);
process.env.NODE_OPTIONS = [...options, self].join(" ");
