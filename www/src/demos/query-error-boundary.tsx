import { Button } from "@examples/ui/components/button";
import { Skeleton } from "@examples/ui/components/skeleton";
import {
	type CatchTags,
	QueryErrorBoundary,
	type QueryHandle,
	queryOptions,
	useQuery,
} from "@raf-query/react";
import {
	CatchBoundary,
	type ErrorComponentProps,
} from "@tanstack/react-router";
import { Data, Effect } from "effect";
import { Suspense, use } from "react";

import { DemoBrowser, DemoLink } from "~/demo-kit/browser.tsx";
import { ErrorNotice, FailNextButton } from "~/demo-kit/controls.tsx";
import { defineDemo } from "~/demo-kit/define.ts";
import { seedPosts } from "~/demo-kit/fixtures.ts";
import { createFakeServer } from "~/demo-kit/server.ts";

class PostNotFound extends Data.TaggedError("PostNotFound")<{
	readonly id: number;
}> {}

class Unauthorized extends Data.TaggedError("Unauthorized")<{
	readonly reason: string;
}> {}

class Offline extends Data.TaggedError("Offline") {}

/** A response with an error status, as the fake server answers. */
class HttpError extends Error {
	readonly status: number;
	constructor(status: number) {
		super(`HTTP ${status}`);
		this.status = status;
	}
}

const server = createFakeServer(() => ({ posts: seedPosts() }));

const missingId = 99;

function postQuery(input: { readonly id: number }) {
	return queryOptions({
		queryFn: (context) =>
			Effect.tryPromise({
				// What the API client makes of a failed request: a typed error per status.
				catch: (error) => {
					if (error instanceof HttpError && error.status === 404) {
						return new PostNotFound({ id: input.id });
					}
					if (error instanceof HttpError && error.status === 401) {
						return new Unauthorized({ reason: "session expired" });
					}
					return new Offline();
				},
				try: () =>
					server.respond(
						`GET /posts/${input.id}`,
						(db) => {
							const post = db.posts.find((each) => each.id === input.id);
							if (!post) {
								throw new HttpError(404);
							}
							return post;
						},
						context,
					),
			}),
		queryKey: ["posts", input.id],
		retry: false,
		throwOnError: true,
	});
}

/**
 * A handler per tag `postQuery` can fail with, each typed by it. Offline
 * has none, so it goes on to the error boundary above.
 */
const postErrors = {
	PostNotFound: (props) => (
		<ErrorNotice caughtBy="catchTags.PostNotFound" type="PostNotFound">
			There&apos;s no post {props.error.id}.
		</ErrorNotice>
	),
	Unauthorized: (props) => (
		<ErrorNotice
			action={
				<Button onClick={props.reset} size="xs" variant="outline">
					Sign in again
				</Button>
			}
			caughtBy="catchTags.Unauthorized"
			type="Unauthorized"
		>
			Your {props.error.reason}.
		</ErrorNotice>
	),
} satisfies CatchTags<typeof postQuery>;

type PageData =
	| { readonly page: "list" }
	| { readonly page: "post"; readonly post: QueryHandle<typeof postQuery> };

function PostView(props: { readonly handle: QueryHandle<typeof postQuery> }) {
	const [postPromise] = useQuery(postQuery, props.handle);
	const post = use(postPromise);
	return (
		<div className="grid gap-1">
			<h3 className="text-lg font-semibold">{post.title}</h3>
			<p className="text-sm text-muted-foreground">{post.body}</p>
		</div>
	);
}

// oxlint-disable-next-line workspace/inline-jsx-callback -- a component; defined inline it would remount on every render
function UnhandledError(props: ErrorComponentProps) {
	return (
		<ErrorNotice
			action={
				<Button onClick={props.reset} size="xs" variant="outline">
					Try again
				</Button>
			}
			caughtBy="error boundary"
			type="unknown"
		>
			Something failed, and nothing above handled it.
		</ErrorNotice>
	);
}

function Page(props: { readonly data: PageData }) {
	const data = props.data;
	if (data.page === "list") {
		return (
			<ul className="grid gap-1">
				{[
					...seedPosts().slice(0, 3),
					{ id: missingId, title: "A deleted post" },
				].map((post) => (
					<li key={post.id}>
						<DemoLink
							className="block rounded-md px-2 py-1.5 text-sm hover:bg-accent"
							to={{ path: `/posts/${post.id}` }}
						>
							{post.title}
						</DemoLink>
					</li>
				))}
			</ul>
		);
	}
	return (
		<div className="grid gap-4">
			<DemoLink
				className="text-xs text-muted-foreground hover:text-foreground"
				to={{ path: "/posts" }}
			>
				← All posts
			</DemoLink>
			<CatchBoundary
				errorComponent={UnhandledError}
				getResetKey={() => data.post.key.join("/")}
			>
				<QueryErrorBoundary catchTags={postErrors} query={postQuery}>
					<Suspense fallback={<Skeleton className="h-16 w-full" />}>
						<PostView handle={data.post} />
					</Suspense>
				</QueryErrorBoundary>
			</CatchBoundary>
		</div>
	);
}

function QueryErrorBoundaryDemo() {
	return (
		<div className="grid gap-3">
			<div className="flex flex-wrap gap-2">
				<FailNextButton
					error={{ make: () => new HttpError(401), tag: "Unauthorized" }}
					server={server}
				/>
				<FailNextButton
					error={{ make: () => new Error("Failed to fetch"), tag: "Offline" }}
					server={server}
				/>
			</div>
			<DemoBrowser
				fallback={<Skeleton className="h-24 w-full" />}
				initial={{ path: "/posts" }}
				loader={(args): PageData => {
					const id = Number(args.location.path.split("/")[2]);
					return id
						? { page: "post", post: args.client.prefetch(postQuery, { id }) }
						: { page: "list" };
				}}
			>
				{(route) => <Page data={route.data} />}
			</DemoBrowser>
		</div>
	);
}

export default defineDemo({
	Component: QueryErrorBoundaryDemo,
	hint: "The boundary's handlers are keyed by the tags the post's Effect can fail with: PostNotFound and Unauthorized have one, Offline doesn't. Open the deleted post, then fail a request each way: Offline goes past to the error boundary, as unknown.",
	server,
	title: "Error boundaries typed by the query",
});
