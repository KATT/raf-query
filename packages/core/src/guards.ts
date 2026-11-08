export function isFunction(
	value: unknown,
): value is (...args: never) => unknown {
	return typeof value === "function";
}

/** `Array.isArray` that narrows readonly arrays and tuples too. */
export function isArray(value: unknown): value is ReadonlyArray<unknown> {
	return Array.isArray(value);
}

export function isNumber(value: unknown): value is number {
	return typeof value === "number";
}

export function isObject(value: unknown): value is object {
	return typeof value === "object" && value !== null;
}

export function isString(value: unknown): value is string {
	return typeof value === "string";
}

/** A `Response`, also one from another realm or polyfill. */
export function isResponse(value: unknown): value is Response {
	return Object.prototype.toString.call(value) === "[object Response]";
}
