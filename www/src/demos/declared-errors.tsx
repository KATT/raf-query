import { Button } from "@examples/ui/components/button";
import { Skeleton } from "@examples/ui/components/skeleton";
import {
	errorTypes,
	type QueryHandle,
	queryOptions,
	useQuery,
} from "@raf-query/react";
import {
	CatchBoundary,
	type ErrorComponentProps,
} from "@tanstack/react-router";
import { Data, Match, Result } from "effect";
import { RefreshCw } from "lucide-react";
import { startTransition, Suspense, use } from "react";

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

const server = createFakeServer(() => ({ posts: seedPosts() }));

const missingId = 99;

function postQuery(input: { readonly id: number }) {
	return queryOptions({
		errors: errorTypes(PostNotFound, Unauthorized),
		queryFn: (context) =>
			server.respond(
				`GET /posts/${input.id}`,
				(db) => {
					const post = db.posts.find((each) => each.id === input.id);
					if (!post) {
						throw new PostNotFound({ id: input.id });
					}
					return post;
				},
				context,
			),
		queryKey: ["posts", input.id],
		retry: false,
	});
}

type PageData =
	| { readonly page: "list" }
	| { readonly page: "post"; readonly post: QueryHandle<typeof postQuery> };

function PostView(props: { readonly handle: QueryHandle<typeof postQuery> }) {
	const [postPromise, post] = useQuery(postQuery, props.handle);
	const result = use(postPromise);
	const retry = (
		<Button
			disabled={post.isFetching}
			onClick={() => {
				startTransition(async () => {
					await post.refetch();
				});
			}}
			size="xs"
			variant="outline"
		>
			<RefreshCw /> Retry
		</Button>
	);
	if (Result.isFailure(result)) {
		const failure = Match.valueTags(result.failure, {
			PostNotFound: (error) => ({
				message: `There's no post ${error.id}.`,
				type: "PostNotFound",
			}),
			Unauthorized: (error) => ({
				message: `Sign in to read it (${error.reason}).`,
				type: "Unauthorized",
			}),
		});
		return (
			<ErrorNotice action={retry} caughtBy="Result" type={failure.type}>
				{failure.message}
			</ErrorNotice>
		);
	}
	return (
		<div className="grid gap-1">
			<h3 className="text-lg font-semibold">{result.success.title}</h3>
			<p className="text-sm text-muted-foreground">{result.success.body}</p>
		</div>
	);
}

// oxlint-disable-next-line workspace/inline-jsx-callback -- a component; defined inline it would remount on every render
function UndeclaredError(props: ErrorComponentProps) {
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
			{props.error instanceof Error ? props.error.message : "Something failed"}
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
				errorComponent={UndeclaredError}
				getResetKey={() => data.post.key.join("/")}
			>
				<Suspense fallback={<Skeleton className="h-16 w-full" />}>
					<PostView handle={data.post} />
				</Suspense>
			</CatchBoundary>
		</div>
	);
}

function DeclaredErrors() {
	return (
		<div className="grid gap-3">
			<div className="flex flex-wrap gap-2">
				<FailNextButton
					error={{
						make: () => new Unauthorized({ reason: "session expired" }),
						tag: "Unauthorized",
					}}
					server={server}
				/>
				<FailNextButton server={server} />
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
	Component: DeclaredErrors,
	hint: "The query declares PostNotFound and Unauthorized. Open the deleted post, or fail a request with Unauthorized: each is a typed Result the post matches. A plain failure isn't declared, so it goes to the error boundary as unknown.",
	server,
	title: "Declared errors",
});
