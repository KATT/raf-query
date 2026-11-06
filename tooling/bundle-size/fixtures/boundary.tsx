import { QueryBoundary } from "@raf-query/boundary";
import { createQueryClient } from "@raf-query/react";

import { issueQuery, render } from "./render.tsx";

await render(createQueryClient(), (children) => (
	<QueryBoundary fallback="Loading" query={issueQuery}>
		{children}
	</QueryBoundary>
));
