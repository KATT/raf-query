import {
	createQueryClient,
	fetchEntry,
	invalidateOne,
	load,
	queryOptions,
} from "@raf-query/core";

import { getIssue } from "./api.ts";
import { group } from "@raf-query/core/groups";

const issues = group("issues");

const issueQuery = (input: { readonly id: number }) =>
	queryOptions({
		queryFn: () => getIssue(input.id),
		queryKey: issues(input.id),
	});

const client = createQueryClient();
const [, data] = await load(client, {
	issue: fetchEntry(issueQuery, { id: 1 }),
});
document.title = data.issue.title;
document.addEventListener("click", () => {
	void invalidateOne(client, issueQuery, { id: 1 });
});
