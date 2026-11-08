import { createQueryClient, QueryDevtools } from "@raf-query/react";

import { render } from "./render.tsx";

await render(createQueryClient(), (children) => (
	<>
		{children}
		<QueryDevtools />
	</>
));
