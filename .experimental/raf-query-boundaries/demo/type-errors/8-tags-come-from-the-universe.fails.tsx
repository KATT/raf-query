/**
 * Tags come from the errors the root declares
 *
 * The root declares `AppError`, everything a `DocsClient` call can fail with.
 * A boundary can only list tags of it, so a typo is caught, with a suggestion.
 */
import { Boundary } from "@raf-query/react/boundary";

import { DocAccess } from "../src/boundaries.tsx";

export const [Typo, useTypo] = Boundary.catchErrors(DocAccess, {
	fallback: () => <p>Gone</p>,
	name: "Typo",
	tags: ["DocNotFund"],
});
