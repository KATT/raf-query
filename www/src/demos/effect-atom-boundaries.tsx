import { Playground } from "@examples/experimental-effect-atom/live";

import { defineStandaloneDemo } from "~/demo-kit/define.ts";

export default defineStandaloneDemo({
	Component: Playground,
	hint: "Each dashed box is a boundary, labelled with what it catches. Flip a switch to make the server fail, open the locked doc or the one that doesn't exist, or save an empty title: each failure lands in the boundary that catches it, or back in the component, and the log says where.",
	title: "Typed error boundaries over atoms",
});
