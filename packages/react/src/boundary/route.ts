/**
 * Where a failure goes, given the boundary a component read through. Only a
 * typed failure (`Cause.findError`) can reach a typed boundary; defects and
 * interrupts always go to the root. A typed failure goes to the innermost
 * boundary in the chain that lists its `_tag`, or back to the component.
 */
import { Cause, Predicate, Result } from "effect";

/** The part of a boundary routing needs. */
export interface Link {
	readonly displayName: string;
	readonly parent: Link | undefined;
	readonly tags: ReadonlySet<string>;
}

export type Route<L extends Link> =
	| { readonly boundary: L; readonly error: unknown; readonly kind: "caught" }
	| { readonly error: unknown; readonly kind: "uncaught" }
	| { readonly kind: "defect" };

/**
 * Whether `link` catches `error`: it carries a string `_tag` the boundary
 * lists. No schema check: the typed failure channel is trusted.
 */
function catches(link: Link, error: unknown): boolean {
	return (
		Predicate.hasProperty(error, "_tag") &&
		// oxlint-disable-next-line eslint/no-underscore-dangle -- boundaries match failures by tag
		Predicate.isString(error._tag) &&
		// oxlint-disable-next-line eslint/no-underscore-dangle -- boundaries match failures by tag
		link.tags.has(error._tag)
	);
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
