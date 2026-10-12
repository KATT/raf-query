/**
 * The one place a value's static type is replaced. Every call site states
 * the invariant that makes it sound in a `SAFETY:` comment.
 */
export function unsafeCast<T>(value: unknown): T {
	// SAFETY: callers justify each use; see above.
	// oxlint-disable-next-line typescript/consistent-type-assertions
	return value as T;
}
