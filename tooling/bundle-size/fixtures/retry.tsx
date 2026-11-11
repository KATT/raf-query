import { createQueryClient, retry } from "@raf-query/react";

import { render } from "./render.tsx";

await render(createQueryClient({ parts: [retry()] }));
