"use client";

import {
	DEFAULT_LOADER_VERB,
	LoaderVerb,
	loaderVerbs,
} from "@examples/db/types";
import {
	LoaderVerbBar,
	loaderVerbLinkClassName,
} from "@examples/kit/components/loader-verb";
import { useParams, usePathname, useSearchParams } from "next/navigation";
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

/** The bar's links: the same page and search under each verb. */
export function LoaderVerbNav(props: { readonly verb: LoaderVerb }) {
	const pathname = usePathname();
	const search = useSearchParams().toString();
	const rest = pathname.slice(`/${props.verb}`.length);

	return (
		<LoaderVerbBar verb={props.verb}>
			{loaderVerbs.map((next) => (
				<AppLink
					aria-current={next === props.verb ? "page" : undefined}
					className={loaderVerbLinkClassName(next === props.verb)}
					href={`/${next}${rest}${search === "" ? "" : `?${search}`}`}
					key={next}
				>
					{next}
				</AppLink>
			))}
		</LoaderVerbBar>
	);
}
