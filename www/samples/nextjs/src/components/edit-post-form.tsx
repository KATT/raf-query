"use client";

import { invalidateOne, useQueryClient } from "@raf-query/react";

import { updatePost } from "~/actions.ts";
import { postQuery } from "~/queries.ts";

export function EditPostForm(props: { slug: string }) {
	const qc = useQueryClient();
	// #region form
	return (
		<form
			action={async (formData) => {
				await updatePost(formData);
				await invalidateOne(qc, postQuery, { slug: props.slug });
			}}
		/>
	);
	// #endregion
}
