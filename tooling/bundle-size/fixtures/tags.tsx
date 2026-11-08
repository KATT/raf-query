import {
	createQueryClient,
	groups,
	invalidateMany,
	tag,
} from "@raf-query/react";

import { render } from "./render.tsx";

const author = tag<string>("author");

const client = createQueryClient({ features: [groups()] });
await render(client);
document.addEventListener("click", () => {
	void invalidateMany(client, author, "ada");
});
