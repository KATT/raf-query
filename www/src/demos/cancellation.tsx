import { Button } from "@examples/ui/components/button";
import { Skeleton } from "@examples/ui/components/skeleton";
import {
	type DefinedQueryHandle,
	ensureEntry,
	infiniteQueryOptions,
	invalidateOne,
	load,
	useQuery,
	useQueryClient,
} from "@raf-query/react";
import { RefreshCw, RotateCcw } from "lucide-react";

import { DemoBrowser, DemoLink } from "~/demo-kit/browser.tsx";
import { formatTime, Spinner } from "~/demo-kit/controls.tsx";
import { defineDemo } from "~/demo-kit/define.ts";
import { createFakeServer } from "~/demo-kit/server.ts";
import { group } from "@raf-query/react/groups";

const inbox = group("inbox");

const server = createFakeServer(() => ({
	messages: [
		{ from: "Ada", id: 1, subject: "Loader review" },
		{ from: "Grace", id: 2, subject: "Re: abort signals" },
		{ from: "Linus", id: 3, subject: "Cache sizes" },
	],
}));

interface MessagePage {
	readonly items: ReadonlyArray<{
		readonly from: string;
		readonly id: number;
		readonly subject: string;
	}>;
	readonly nextCursor: number | null;
}

function messageNext(lastPage: MessagePage) {
	return lastPage.nextCursor;
}

function inboxQuery() {
	return infiniteQueryOptions({
		getNextPageParam: messageNext,
		initialPageParam: 0,
		queryFn: (context) =>
			server.respond(
				"GET /inbox",
				(db) => ({ items: db.messages, nextCursor: null }),
				context,
			),
		queryKey: inbox(),
		staleTime: 60_000,
	});
}

type PageData =
	| {
			readonly inbox: DefinedQueryHandle<typeof inboxQuery>;
			readonly page: "inbox";
	  }
	| { readonly page: "settings" };

function Inbox(props: {
	readonly handle: DefinedQueryHandle<typeof inboxQuery>;
}) {
	const queryClient = useQueryClient();
	const [pages, controls] = useQuery(inboxQuery, props.handle);
	const messages = pages.pages.flatMap((page) => page.items);
	return (
		<div aria-busy={controls.isFetching} className="grid gap-3">
			<ul className="grid gap-1.5">
				{messages.map((message) => (
					<li
						className="flex gap-3 rounded-md border px-3 py-1.5 text-sm"
						key={message.id}
					>
						<span className="w-14 font-medium">{message.from}</span>
						{message.subject}
					</li>
				))}
			</ul>
			<div className="flex flex-wrap items-center gap-2">
				<Button
					disabled={controls.isFetching}
					onClick={() => {
						void controls.refetch();
					}}
					size="xs"
					variant="outline"
				>
					<RefreshCw /> Refetch
				</Button>
				<Button
					onClick={() => {
						void invalidateOne(queryClient, inboxQuery);
					}}
					size="xs"
					variant="outline"
				>
					<RotateCcw /> Invalidate
				</Button>
				<span className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
					{controls.isFetching ? <Spinner /> : null}
					Fetched at {formatTime(controls.updatedAt)}
				</span>
			</div>
		</div>
	);
}

function Page(props: { readonly data: PageData }) {
	const data = props.data;
	return (
		<div className="grid gap-4">
			<nav className="flex gap-1 text-sm">
				{[
					{ label: "Inbox", path: "/inbox" },
					{ label: "Settings", path: "/settings" },
				].map((link) => (
					<DemoLink
						className="rounded-md px-2.5 py-1 hover:bg-accent aria-[current=page]:bg-accent aria-[current=page]:font-medium"
						key={link.path}
						to={{ path: link.path }}
					>
						{link.label}
					</DemoLink>
				))}
			</nav>
			{data.page === "inbox" ? (
				<Inbox handle={data.inbox} />
			) : (
				<p className="text-sm text-muted-foreground">
					Nothing on this page reads the inbox.
				</p>
			)}
		</div>
	);
}

function Cancellation() {
	return (
		<DemoBrowser
			fallback={<Skeleton className="h-28 w-full" />}
			initial={{ path: "/inbox" }}
			loader={async (args): Promise<PageData> => {
				if (args.location.path !== "/inbox") {
					return { page: "settings" };
				}
				const [handles] = await load(args.client, {
					inbox: ensureEntry(inboxQuery),
				});
				return { inbox: handles.inbox, page: "inbox" };
			}}
		>
			{(route) => <Page data={route.data} />}
		</DemoBrowser>
	);
}

export default defineDemo({
	Component: Cancellation,
	hint: "Pick Slow and press Refetch, then Invalidate before it lands: the request in flight is aborted and a new one starts. Refetch and open Settings instead: the request runs to the end, and the inbox is cached when you come back.",
	server,
	title: "Aborting requests that were replaced",
});
