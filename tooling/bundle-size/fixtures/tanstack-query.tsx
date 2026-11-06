import { createQueryClient } from "@raf-query/react";
import {
	type QueryClientLike,
	tanstackQuerySync,
} from "@raf-query/react/tanstack-query";

import { render } from "./render.tsx";

declare const queryClient: QueryClientLike;

await render(createQueryClient({ features: [tanstackQuerySync(queryClient)] }));
