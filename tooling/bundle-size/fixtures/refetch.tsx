import {
	createQueryClient,
	focusRefetch,
	reconnectRefetch,
} from "@raf-query/react";

import { render } from "./render.tsx";

await render(
	createQueryClient({ features: [focusRefetch(), reconnectRefetch()] }),
);
