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
	const copy: Record<string, unknown> = {};
	let same = names.length === Object.keys(before).length;
	for (const name of names) {
		const value = replaceEqualDeep(before[name], after[name]);
		copy[name] = value;
		if (value !== before[name] || !Object.hasOwn(before, name)) {
			same = false;
		}
	}
	if (same) {
		return previous;
	}
	return arrays ? names.map((name) => copy[name]) : copy;
}
