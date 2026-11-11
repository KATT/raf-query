"use client";

import { invalidateOne } from "@raf-query/react";

import { updatePost } from "~/actions.ts";
import { postQuery } from "~/queries.ts";
import { useQueryClient } from "~/raf.ts";

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
