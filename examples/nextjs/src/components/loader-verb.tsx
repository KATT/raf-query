"use client";

import { DEFAULT_LOADER_VERB, LoaderVerb } from "@examples/db/types";
import { useParams } from "next/navigation";
import type { ComponentProps } from "react";

import { AppLink } from "./settings.tsx";

/** The URL's verb, or the default outside `/[verb]/…`. */
export function useLoaderVerb(): LoaderVerb {
	const params = useParams<{ verb?: string }>();
	return LoaderVerb.safeParse(params.verb).data ?? DEFAULT_LOADER_VERB;
}

/** The header's link to the list, under the current verb. */
export function IssuesLink(
	props: Omit<ComponentProps<typeof AppLink>, "href">,
) {
	const verb = useLoaderVerb();
	return <AppLink {...props} href={`/${verb}/issues`} />;
}
