export function isFunction(
	value: unknown,
): value is (...args: never) => unknown {
	return typeof value === "function";
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
