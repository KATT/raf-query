import { createQueryClient } from "@raf-query/react";

import { renderPages } from "./pages.tsx";
import { render } from "./render.tsx";

const client = createQueryClient();
await render(client);
await renderPages(client);
