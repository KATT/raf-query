/**
 * Where a failure goes, given the boundary a component read through. Only a
 * typed failure (`Cause.findError`) can reach a typed boundary; defects and
 * interrupts always go to the root. A typed failure goes to the innermost
 * boundary in the chain whose schemas accept it, or back to the component.
 */
import { Cause, Result, Schema } from "effect";

/** An error class a boundary catches: a schema of tagged values, such as a `Schema.TaggedError`. */
export type Catchable = Schema.Top & {
	readonly Type: { readonly _tag: string };
};

/** The part of a boundary routing needs. */
export interface Link {
	readonly displayName: string;
	readonly errors: ReadonlyArray<Catchable>;
	readonly parent: Link | undefined;
}

export type Route<L extends Link> =
	| { readonly boundary: L; readonly error: unknown; readonly kind: "caught" }
	| { readonly error: unknown; readonly kind: "uncaught" }
	| { readonly kind: "defect" };

export function catches(link: Link, error: unknown): boolean {
	return link.errors.some((schema) => Schema.is(schema)(error));
}

export function route<L extends Link>(
	boundary: L,
	cause: Cause.Cause<unknown>,
): Route<L> {
	const found = Cause.findError(cause);
	if (Result.isFailure(found)) {
		return { kind: "defect" };
	}
	const error = found.success;
	for (
		let link: Link | undefined = boundary;
		link !== undefined;
		link = link.parent
	) {
		if (catches(link, error)) {
			// SAFETY: every parent of an `L` is an `L`: boundaries only derive from boundaries.
			const caught = link as L;
			return { boundary: caught, error, kind: "caught" };
		}
	}
	return { error, kind: "uncaught" };
}

export function rootOf<L extends Link>(boundary: L): L {
	let link: Link = boundary;
	while (link.parent !== undefined) {
		link = link.parent;
	}
	// SAFETY: see `route`.
	return link as L;
}

/** The tags of the errors left over, for type errors that name them. */
export type TagsOf<E> = E extends { readonly _tag: infer Tag } ? Tag : E;
