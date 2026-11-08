import {
	createQueryClient,
	group,
	load,
	prefetchEntry,
	QueryClientProvider,
	type QueryHandle,
	queryOptions,
	useQuery,
} from "@raf-query/react";
import { Suspense, use } from "react";
import { createRoot } from "react-dom/client";

const builds = group("builds");

const logQuery = (input: { readonly id: number }) =>
	queryOptions({
		async *queryFn() {
			const response = await fetch(`/api/builds/${input.id}/log`);
			const body = response.body?.pipeThrough(new TextDecoderStream());
			if (body) {
				yield* body;
			}
		},
		queryKey: builds(input.id, "log"),
		stream: {
			initial: "",
			reduce: (log: string, chunk: string) => log + chunk,
		},
	});

function Log(props: { readonly handle: QueryHandle<typeof logQuery> }) {
	const [logThenable] = useQuery(logQuery, props.handle);
	const log = use(logThenable);
	return <pre>{log}</pre>;
}

const client = createQueryClient();
const [handles] = await load(client, {
	log: prefetchEntry(logQuery, { id: 1 }),
});
createRoot(document.body).render(
	<QueryClientProvider client={client}>
		<Suspense fallback="Loading">
			<Log handle={handles.log} />
		</Suspense>
	</QueryClientProvider>,
);
