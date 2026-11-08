import { createQueryClient, reconnectRefetch } from "@raf-query/react";

import { render } from "./render.tsx";

await render(createQueryClient({ features: [reconnectRefetch()] }));
