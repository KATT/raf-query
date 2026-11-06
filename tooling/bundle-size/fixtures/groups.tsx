import { createQueryClient, invalidateMany } from "@raf-query/react";
import { group, groups, tag } from "@raf-query/react/groups";

import { render } from "./render.tsx";

const issues = group("issues");
const author = tag<string>("author");

const client = createQueryClient({ features: [groups()] });
await render(client);
document.addEventListener("click", () => {
	void invalidateMany(client, issues);
	void invalidateMany(client, author, "ada");
});
