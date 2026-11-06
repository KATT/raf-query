export function isFunction(
	value: unknown,
): value is (...args: never) => unknown {
	return typeof value === "function";
}

export function isNumber(value: unknown): value is number {
	return typeof value === "number";
}
