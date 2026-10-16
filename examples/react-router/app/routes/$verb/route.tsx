import { loaderVerbs } from "@examples/db/types";
import {
	LoaderVerbBar,
	loaderVerbLinkClassName,
} from "@examples/kit/components/loader-verb";
import { Outlet, useLocation } from "react-router";

import { AppLink } from "~/components/app-link.tsx";
import { parseLoaderVerb } from "~/loader-verb.ts";

import type { Route } from "./+types/route";

/**
 * `/prefetch/…`, `/ensure/…`, `/fetch/…`: the first segment picks how the
 * pages' loaders start their queries.
 */
export function loader(args: Route.LoaderArgs) {
	return { verb: parseLoaderVerb(args.params.verb) };
}

export default function VerbLayout(props: Route.ComponentProps) {
	const verb = props.loaderData.verb;
	const location = useLocation();
	const rest = location.pathname.slice(`/${verb}`.length);

	return (
		<>
			<LoaderVerbBar verb={verb}>
				{loaderVerbs.map((next) => (
					<AppLink
						aria-current={next === verb ? "page" : undefined}
						className={loaderVerbLinkClassName(next === verb)}
						key={next}
						to={`/${next}${rest}${location.search}`}
					>
						{next}
					</AppLink>
				))}
			</LoaderVerbBar>
			<Outlet />
		</>
	);
}
