/**
 * The few `effect/Predicate` guards the engine needs, so the default entry
 * imports nothing from `effect` at runtime.
 */

export function isObject(value: unknown): value is object {
	return (
		(typeof value === "object" && value !== null) || typeof value === "function"
	);
}

export function hasProperty<P extends PropertyKey>(
	value: unknown,
	property: P,
): value is { [K in P]: unknown } {
	return isObject(value) && property in value;
}

export function isFunction(
	value: unknown,
): value is (...args: never) => unknown {
	return typeof value === "function";
}

export function isNumber(value: unknown): value is number {
	return typeof value === "number";
}
