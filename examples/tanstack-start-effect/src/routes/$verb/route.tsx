import { LoaderVerb, loaderVerbs } from "@examples/db/types";
import {
	LoaderVerbBar,
	loaderVerbLinkClassName,
} from "@examples/kit/components/loader-verb";
import {
	createFileRoute,
	Link,
	notFound,
	Outlet,
} from "@tanstack/react-router";

/**
 * `/prefetch/…`, `/ensure/…`, `/fetch/…`: the first segment picks how the
 * pages' loaders start their queries.
 */
export const Route = createFileRoute("/$verb")({
	params: {
		parse: (params) => {
			const verb = LoaderVerb.safeParse(params.verb);
			if (!verb.success) {
				throw notFound();
			}
			return { verb: verb.data };
		},
	},
	component: VerbLayout,
});

function VerbLayout() {
	const params = Route.useParams();

	return (
		<>
			<LoaderVerbBar verb={params.verb}>
				{loaderVerbs.map((next) => (
					<Link
						className={loaderVerbLinkClassName(next === params.verb)}
						key={next}
						params={(prev) => ({ ...prev, verb: next })}
						search={(prev) => prev}
						to="."
					>
						{next}
					</Link>
				))}
			</LoaderVerbBar>
			<Outlet />
		</>
	);
}
