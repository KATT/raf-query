import { createQueryClient, focusRefetch } from "@raf-query/react";

import { render } from "./render.tsx";

await render(createQueryClient({ plugins: [focusRefetch()] }));
