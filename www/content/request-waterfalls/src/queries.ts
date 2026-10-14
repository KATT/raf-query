import { queryOptions } from "@raf-query/react";

import {
	getAuthor,
	getCurrentOrg,
	getCurrentUser,
	getOrg,
	getPost,
	listComments,
} from "./api";

export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: ["post", input.slug],
		queryFn: () => getPost(input.slug),
		staleTime: 30_000,
	});
}

export function commentsQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: ["comments", input.slug],
		queryFn: () => listComments(input.slug),
	});
}

export function authorQuery(input: { id: string }) {
	return queryOptions({
		queryKey: ["author", input.id],
		queryFn: () => getAuthor(input.id),
	});
}

export function currentUserQuery() {
	return queryOptions({
		queryFn: () => getCurrentUser(),
		queryKey: ["user", "current"],
	});
}

export function orgQuery(input: { orgId: string }) {
	return queryOptions({
		queryFn: () => getOrg(input),
		queryKey: ["org", input.orgId],
	});
}

export function currentOrgQuery() {
	return queryOptions({
		queryKey: ["org", "current"],
		queryFn: () => getCurrentOrg(),
	});
}
