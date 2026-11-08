import { describe, expectTypeOf, it } from "vitest";

import {
	bindInfiniteQueryOptions,
	bindQueryOptions,
	createQueryClient,
	type DataOf,
	type ErrorOf,
	type Fail,
	feature,
	getData,
	group,
	type InputOf,
	invalidateMany,
	invalidateOne,
	link,
	load,
	type PartialInput,
	prefetch,
	type QueryClient,
	type QueryHandle,
	type QueryInfo,
	type QueryKey,
	queryOptions,
	type Recommended,
	removeMany,
	resetMany,
	retry,
	revalidate,
	setData,
	swr,
	type Target,
	waterfallHandle,
} from "./index.ts";
import type { RootOf } from "./root.ts";
import { author, createBackend, featured, issues } from "./test-utils.ts";

const backend = createBackend();
const client = createQueryClient();
const settings = () =>
	queryOptions({
		queryFn: () => ({ theme: "dark" }),
		queryKey: issues("settings"),
	});
const titles = (input: { readonly id: number }) =>
	queryOptions({
		queryFn: () => ({ title: `${input.id}` }),
		queryKey: issues("title", input),
		select: (issue) => issue.title,
	});

describe("factory types", () => {
	it("infer data, expected errors and input", () => {
		expectTypeOf<DataOf<typeof backend.issueQuery>>().toEqualTypeOf<{
			readonly author: string;
			readonly id: number;
			readonly title: string;
		}>();
		expectTypeOf<ErrorOf<typeof backend.issueQuery>>().toEqualTypeOf<
			Fail<{ readonly _tag: "NotFound"; readonly id: number }>
		>();
		expectTypeOf<DataOf<typeof titles>>().toEqualTypeOf<string>();
		expectTypeOf<InputOf<typeof settings>>().toEqualTypeOf<undefined>();
		expectTypeOf<InputOf<typeof titles>>().toEqualTypeOf<{
			readonly id: number;
		}>();
	});
});

describe("keys", () => {
	it("type a group's path and the flat keys it builds", () => {
		const drafts = group(issues, "drafts");

		expectTypeOf(drafts.path).toEqualTypeOf<readonly ["issues", "drafts"]>();
		expectTypeOf(drafts("byId", 1)).toEqualTypeOf<
			readonly ["issues", "drafts", "byId", 1]
		>();
		expectTypeOf(drafts("byId", 1)).toExtend<QueryKey>();
		const wrong = () => {
			// @ts-expect-error -- a subgroup's name is a string
			group(issues, 1);
		};
		expectTypeOf(wrong).toBeFunction();
	});

	it("take hand-written keys in queryOptions, typed as their literal tuple", () => {
		const list = () =>
			queryOptions({ queryFn: () => 1, queryKey: ["issues", "list"] });
		const frozen = () =>
			queryOptions({
				queryFn: () => 1,
				queryKey: ["issues", "list"] as const,
			});
		const spread = (input: { readonly id: number }) =>
			queryOptions({ queryFn: () => 1, queryKey: [...issues("byId"), input] });

		expectTypeOf<QueryHandle<typeof list>["queryKey"]>().toEqualTypeOf<
			readonly ["issues", "list"]
		>();
		expectTypeOf<QueryHandle<typeof frozen>["queryKey"]>().toEqualTypeOf<
			readonly ["issues", "list"]
		>();
		expectTypeOf<QueryHandle<typeof spread>["queryKey"]>().toEqualTypeOf<
			readonly ["issues", "byId", { readonly id: number }]
		>();
	});
});

describe("load types", () => {
	it("type handles and data per entry kind", () => {
		expectTypeOf(typedLoad).toBeFunction();
	});
});

async function typedLoad() {
	{
		const [handles, data] = await load(client, {
			issue: swr(backend.issueQuery, { id: 1 }),
			settings: revalidate(settings),
			title: prefetch(titles, { id: 1 }),
		});

		expectTypeOf(handles.issue).toEqualTypeOf<
			QueryHandle<typeof backend.issueQuery>
		>();
		expectTypeOf(handles.title).toEqualTypeOf<QueryHandle<typeof titles>>();
		expectTypeOf(data.settings).toEqualTypeOf<{ theme: string }>();
		expectTypeOf(data).not.toHaveProperty("title");
		// @ts-expect-error -- the input is required
		revalidate(titles);
		// @ts-expect-error -- the input has the factory's type
		revalidate(titles, { id: "1" });
	}
}

describe("waterfall types", () => {
	it("type waterfall handles like loaded ones", () => {
		const handle = waterfallHandle(titles, { id: 1 });

		expectTypeOf(handle).toEqualTypeOf<QueryHandle<typeof titles>>();
		expectTypeOf(
			waterfallHandle(titles, handle, (input) => {
				expectTypeOf(input).toEqualTypeOf<{ readonly id: number }>();
				return { ...input, id: 2 };
			}),
		).toEqualTypeOf(handle);
		// @ts-expect-error -- the remix form takes an updater, not an input
		waterfallHandle(titles, handle, { id: 2 });
		// @ts-expect-error -- the updater returns the factory's input
		waterfallHandle(titles, handle, (input) => ({ ...input, id: "2" }));
	});
});

describe("inline factory makers", () => {
	function makeFactory<TInput extends { readonly id: number }, TData>(
		name: string,
		get: (input: TInput) => Promise<TData>,
	) {
		const own = group(name);
		return (input: TInput) =>
			queryOptions({ queryFn: () => get(input), queryKey: own(input) });
	}
	const getPost = async (input: { readonly id: number }) => ({
		title: `${input.id}`,
	});

	it("infer their own type parameters in entries, handles and verbs", async () => {
		const [handles, data] = await load(client, {
			cached: swr(makeFactory("post", getPost), { id: 1 }),
			fetched: revalidate(makeFactory("post", getPost), { id: 1 }),
			prefetched: prefetch(makeFactory("post", getPost), { id: 1 }),
		});
		const handle = waterfallHandle(makeFactory("post", getPost), { id: 1 });

		expectTypeOf(data.cached).toEqualTypeOf<{ title: string }>();
		expectTypeOf(data.fetched).toEqualTypeOf<{ title: string }>();
		expectTypeOf(handles.prefetched.input).toEqualTypeOf<{
			readonly id: number;
		}>();
		expectTypeOf(handle.input).toEqualTypeOf<{ readonly id: number }>();
		await invalidateOne(client, makeFactory("post", getPost), { id: 1 });
		// @ts-expect-error -- the input still has the maker's type
		swr(makeFactory("post", getPost), { id: "1" });
		// @ts-expect-error -- and so does a waterfall handle's
		waterfallHandle(makeFactory("post", getPost), { id: "1" });
	});
});

describe("verb types", () => {
	it("check inputs, partial inputs and target parameters", () => {
		void invalidateOne(client, titles, { id: 1 });
		void invalidateMany(client, author, "ada");
		void invalidateMany(client, author);
		void invalidateMany(client, titles, {});
		void invalidateMany(client, issues);
		void invalidateMany(client, featured);
		// @ts-expect-error -- a partial input still has the factory's types
		void invalidateMany(client, titles, { id: "1" });
		const bySlug = (input: { readonly slug: string }) =>
			queryOptions({
				queryFn: () => input.slug,
				queryKey: issues("bySlug", input.slug),
			});
		expectTypeOf<PartialInput<typeof bySlug>>().toEqualTypeOf<{
			readonly slug?: string;
		}>();
		void invalidateMany(client, bySlug, { slug: "a" });
		removeMany(client, [[bySlug, { slug: "a" }]]);
		// @ts-expect-error -- a partial is part of the input, not the key's last segment
		void invalidateMany(client, bySlug, "a");
		// @ts-expect-error -- in a list too
		void resetMany(client, [[bySlug, "a"]]);
		// @ts-expect-error -- a target parameter is typed
		void invalidateMany(client, author, 1);
		// @ts-expect-error -- a group takes no parameter
		void invalidateMany(client, issues, "x");
		// @ts-expect-error -- invalidateOne needs the full input
		void invalidateOne(client, titles);
		const wrong = () => {
			// @ts-expect-error -- invalidateOne takes factories only
			void invalidateOne(client, author, "ada");
			// @ts-expect-error -- raw strings aren't targets
			void invalidateMany(client, "issues");
			// @ts-expect-error -- nor are hand-written keys
			void invalidateMany(client, ["issues"] as const);
			// @ts-expect-error -- nor are keys a group built
			void invalidateMany(client, issues("list"));
		};
		expectTypeOf(wrong).toBeFunction();
	});

	it("check each target of a list on its own", async () => {
		const statuses = (input: {
			readonly id: number;
			readonly status: "closed" | "open";
		}) =>
			queryOptions({
				queryFn: () => input.status,
				queryKey: issues("status", input),
			});
		await invalidateMany(client, [
			issues,
			titles,
			[statuses, { status: "open" }],
			[titles, {}],
			author,
			[author, "ada"],
			featured,
		]);
		await resetMany(client, [issues, [author, "ada"]]);
		removeMany(client, [[statuses, { id: 1 }], featured]);
		await invalidateMany(client, []);
		const kept: ReadonlyArray<typeof issues | typeof titles> = [issues];
		await invalidateMany(client, kept);
		const wrong = () => {
			// @ts-expect-error -- a partial input still has its factory's types
			void invalidateMany(client, [issues, [statuses, { status: "done" }]]);
			// @ts-expect-error -- and so does a partial of another field
			void invalidateMany(client, [[titles, { id: "1" }]]);
			// @ts-expect-error -- a target parameter is typed
			void invalidateMany(client, [[author, 1]]);
			// @ts-expect-error -- a group takes no parameter
			void invalidateMany(client, [[issues, "x"]]);
			// @ts-expect-error -- nor does a target without one
			void resetMany(client, [[featured, "x"]]);
			// @ts-expect-error -- raw strings aren't targets
			void invalidateMany(client, [issues, "issues"]);
			// @ts-expect-error -- nor are hand-written keys
			void invalidateMany(client, [["issues"]]);
			// @ts-expect-error -- nor are keys a group built
			removeMany(client, [issues("list")]);
			// @ts-expect-error -- a hand-written key isn't a list of targets either
			void invalidateMany(client, ["issues"] as const);
		};
		expectTypeOf(wrong).toBeFunction();
	});

	it("type data before select", () => {
		expectTypeOf(getData(client, titles, { id: 1 })).toEqualTypeOf<
			{ title: string } | undefined
		>();
		setData(client, titles, { id: 1 }, (previous) => ({
			title: previous?.title ?? "",
		}));
	});

	it("skip the input of setData only for a factory that takes none", () => {
		const optional = (input?: { readonly id: number }) =>
			queryOptions({
				queryFn: () => ({ id: input?.id ?? 0 }),
				queryKey: issues("optional", input),
			});
		setData(client, settings, (previous) => {
			expectTypeOf(previous).toEqualTypeOf<{ theme: string } | undefined>();
			return { theme: "light" };
		});
		setData(client, settings, { theme: "light" });
		setData(client, optional, { id: 1 });
		setData(client, optional, { id: 1 }, (previous) => ({
			id: previous?.id ?? 1,
		}));
		const wrong = () => {
			// @ts-expect-error -- a factory with an input needs it
			setData(client, titles, { title: "" });
			// @ts-expect-error -- and a factory with none takes no input
			setData(client, settings, undefined, { theme: "light" });
			// @ts-expect-error -- the short form still checks the data
			setData(client, settings, { theme: 1 });
		};
		expectTypeOf(wrong).toBeFunction();
	});
});

describe("root types", () => {
	const ownership = feature<{
		readonly meta: { readonly owner?: "posts-team" | "users-team" };
	}>();
	const makeQueryClient = () =>
		createQueryClient({
			features: [ownership],
			links: [retry()],
			staleTime: 30_000,
		});
	const posts = group("posts");
	const writtenBy: Target<{ readonly owner: string | undefined }, string> = {
		where: (query, owner) => query.meta.owner === owner,
	};
	const rootQueryOptions = bindQueryOptions<typeof makeQueryClient>();
	const postById = (input: {
		readonly authorId: string;
		readonly id: string;
	}) =>
		rootQueryOptions({
			meta: {
				owner: "posts-team",
				retry: false,
			},
			queryFn: async () => ({ title: "x" }),
			queryKey: posts("byId", input),
		});

	it("give a root the meta its parts declare", () => {
		expectTypeOf<RootOf<typeof makeQueryClient>>().toEqualTypeOf<{
			readonly meta: {
				readonly owner: "posts-team" | "users-team" | undefined;
				readonly retry: number | false | undefined;
			};
		}>();
		expectTypeOf<
			RootOf<
				ReturnType<
					typeof createQueryClient<
						Recommended["links"],
						Recommended["features"]
					>
				>
			>
		>().toEqualTypeOf<{
			readonly meta: {
				readonly refetchInterval: number | false | undefined;
				readonly refetchOnReconnect: boolean | undefined;
				readonly refetchOnWindowFocus: boolean | undefined;
				readonly retry: number | false | undefined;
			};
		}>();
		expectTypeOf<
			keyof RootOf<typeof createQueryClient<[], []>>["meta"]
		>().toEqualTypeOf<never>();
	});

	it("type a link's op by what it declares", () => {
		const traced = link<{ readonly meta: { readonly traceId?: string } }>(
			(op, next) => {
				expectTypeOf(op.meta.traceId).toEqualTypeOf<string | undefined>();
				return next(op);
			},
		);
		const qc = () => createQueryClient({ links: [traced] });
		expectTypeOf<RootOf<typeof qc>>().toEqualTypeOf<{
			readonly meta: { readonly traceId: string | undefined };
		}>();
	});

	it("check meta against the root", () => {
		const wrong = () => {
			rootQueryOptions({
				// @ts-expect-error -- no link or feature in the root reads `cacheFor`
				meta: { cacheFor: 1000 },
				queryFn: async () => 1,
				queryKey: posts("x"),
			});
			rootQueryOptions({
				// @ts-expect-error -- meta fields have their part's types
				meta: { owner: "nobody" },
				queryFn: async () => 1,
				queryKey: posts("y"),
			});
			rootQueryOptions({
				// @ts-expect-error -- a typo isn't a field the root declares
				meta: { retyr: 1 },
				queryFn: async () => 1,
				queryKey: posts("z"),
			});
		};
		expectTypeOf(wrong).toBeFunction();
		expectTypeOf(postById).returns.toHaveProperty("meta");
		queryOptions({
			meta: { cacheFor: 1000, retyr: 1 },
			queryFn: async () => 1,
			queryKey: posts("unbound"),
		});
	});

	it("bind infiniteQueryOptions to the root too", () => {
		const rootInfiniteQueryOptions =
			bindInfiniteQueryOptions<typeof makeQueryClient>();
		const postPages = () =>
			rootInfiniteQueryOptions({
				getNextPageParam: (page: number) => page + 1,
				initialPageParam: 0,
				meta: { owner: "posts-team", retry: 1 },
				queryFn: async (context) => context.pageParam,
				queryKey: posts("pages"),
			});
		void invalidateOne(makeQueryClient(), postPages);
		const wrong = () => {
			rootInfiniteQueryOptions({
				getNextPageParam: () => null,
				initialPageParam: 0,
				// @ts-expect-error -- no link or feature in the root reads `cacheFor`
				meta: { cacheFor: 1000 },
				queryFn: async () => 1,
				queryKey: posts("wrong-pages"),
			});
			// @ts-expect-error -- postPages belongs to makeQueryClient's root
			void invalidateOne(createQueryClient(), postPages);
		};
		expectTypeOf(wrong).toBeFunction();
	});

	it("take the root's clients and targets", () => {
		const qc = makeQueryClient();
		void invalidateOne(qc, postById, { authorId: "a", id: "1" });
		void invalidateMany(qc, postById, { authorId: "a" });
		void invalidateMany(qc, posts);
		void invalidateMany(qc, writtenBy, "a");
		void invalidateMany(qc, {
			where: (query: QueryInfo<{ readonly owner: string | undefined }>) =>
				query.meta.owner === "users-team",
		});
		void invalidateMany(qc, titles);
		const bare = createQueryClient({ links: [retry()] });
		const wrong = () => {
			// @ts-expect-error -- postById belongs to makeQueryClient's root
			void invalidateMany(bare, postById);
			// @ts-expect-error -- `writtenBy` reads meta.owner, which nothing in this root declares
			void invalidateMany(bare, writtenBy, "a");
		};
		void invalidateMany(bare, posts);
		expectTypeOf(wrong).toBeFunction();
	});

	it("check a list's targets against the client's root", () => {
		const qc = makeQueryClient();
		const owned: Target<{ readonly owner: string | undefined }> = {
			where: (query) => query.meta.owner === "users-team",
		};
		const ownedBy: Target<
			{ readonly owner: string | undefined },
			"posts-team" | "users-team"
		> = { where: (query, team) => query.meta.owner === team };
		void invalidateMany(qc, [
			posts,
			postById,
			[postById, { authorId: "a" }],
			[writtenBy, "a"],
			owned,
			[ownedBy, "posts-team"],
			titles,
		]);
		const bare = createQueryClient({ links: [retry()] });
		void invalidateMany(bare, [posts, titles, [titles, { id: 1 }]]);
		const anyClient: QueryClient = qc;
		void invalidateMany(anyClient, [postById, [writtenBy, "a"], owned]);
		const wrong = () => {
			// @ts-expect-error -- postById belongs to makeQueryClient's root
			void invalidateMany(bare, [posts, postById]);
			// @ts-expect-error -- `writtenBy` reads meta.owner, which nothing in this root declares
			void invalidateMany(bare, [[writtenBy, "a"]]);
			// @ts-expect-error -- nor does anything declare meta.owner
			void resetMany(bare, [owned]);
			// @ts-expect-error -- a target that needs a parameter needs it in a list too
			void invalidateMany(qc, [ownedBy]);
			// @ts-expect-error -- of its type
			removeMany(qc, [[ownedBy, "nobody"]]);
		};
		expectTypeOf(wrong).toBeFunction();
	});

	it("keep roots apart when one has fewer parts", () => {
		const fewer = () => createQueryClient({ features: [ownership] });
		const more = () =>
			createQueryClient({ features: [ownership], links: [retry()] });
		const ofFewer = () =>
			bindQueryOptions<typeof fewer>()({
				queryFn: async () => 1,
				queryKey: group("fewer")(),
			});
		const wrong = () => {
			// @ts-expect-error -- a root with more parts isn't the same root
			void invalidateMany(more(), ofFewer);
			// @ts-expect-error -- nor is one with fewer
			expectTypeOf(fewer()).toEqualTypeOf<ReturnType<typeof more>>();
		};
		expectTypeOf(wrong).toBeFunction();
		expectTypeOf<ReturnType<typeof fewer>>().not.toExtend<
			ReturnType<typeof more>
		>();
		expectTypeOf<ReturnType<typeof more>>().not.toExtend<
			ReturnType<typeof fewer>
		>();
	});

	it("take any root on a bare QueryClient", () => {
		const anyClient: QueryClient = makeQueryClient();
		void invalidateMany(anyClient, writtenBy, "a");
		void invalidateMany(anyClient, postById);
		expectTypeOf(anyClient).toExtend<QueryClient>();
	});
});
