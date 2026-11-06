import { createQueryClient, invalidateMany } from "@raf-query/react";
import { groups, tag } from "@raf-query/react/groups";

import { render } from "./render.tsx";

const author = tag<string>("author");

const client = createQueryClient({ features: [groups()] });
await render(client);
document.addEventListener("click", () => {
	void invalidateMany(client, author, "ada");
});
