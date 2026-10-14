declare module "virtual:docs-manifest" {
	import type { DocSection } from "~/content/types.ts";

	export const sections: ReadonlyArray<DocSection>;
}

declare module "*.md" {
	import type { Doc } from "~/content/types.ts";

	const doc: Doc;
	export default doc;
}
