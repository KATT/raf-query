function isPlainArray(value: unknown): value is ReadonlyArray<unknown> {
	return Array.isArray(value) && value.length === Object.keys(value).length;
}

function isPlainObject(
	value: unknown,
): value is { readonly [name: string]: unknown } {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

/**
 * `next`, reusing every part of `previous` that is deeply equal to it, so
 * unchanged objects keep their identity and memoized readers skip work.
 */
export function replaceEqualDeep(previous: unknown, next: unknown): unknown {
	if (Object.is(previous, next)) {
		return previous;
	}
	const arrays = isPlainArray(previous) && isPlainArray(next);
	if (!arrays && !(isPlainObject(previous) && isPlainObject(next))) {
		return next;
	}
	// SAFETY: both are plain arrays or both plain objects, checked above.
	const before = previous as Record<string, unknown>;
	// SAFETY: as above.
	const after = next as Record<string, unknown>;
	const names = Object.keys(after);
	let same = names.length === Object.keys(before).length;
	// Reads only own keys and builds the copy from entries: JSON can carry a
	// `"__proto__"` key, which `before[name]` would read as the prototype and
	// `copy[name] = value` would set as one.
	const values = names.map((name) => {
		const own = Object.hasOwn(before, name);
		const value = replaceEqualDeep(own ? before[name] : undefined, after[name]);
		if (!own || value !== before[name]) {
			same = false;
		}
		return value;
	});
	if (same) {
		return previous;
	}
	return arrays
		? values
		: Object.fromEntries(names.map((name, index) => [name, values[index]]));
}
