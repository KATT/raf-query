import { createQueryClient, QueryDevtools } from "@raf-query/react";

import { render } from "./render.tsx";

// The examples' guard: the bundle is built with `mode: "production"`, so
// the panel and its module drop out.
await render(createQueryClient(), (children) => (
	<>
		{children}
		{process.env.NODE_ENV !== "production" ? <QueryDevtools /> : null}
	</>
));
