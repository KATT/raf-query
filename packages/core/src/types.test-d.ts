import { describe, expectTypeOf, it } from "vitest";

import {
	action,
	createQueryClient,
	type DataOf,
	defType,
	ensureEntry,
	type ErrorOf,
	type Fail,
	feature,
	fetchEntry,
	getData,
	type InputOf,
	invalidateMany,
	invalidateOne,
	link,
	load,
	prefetchEntry,
	type QueryClient,
	type QueryHandle,
	type QueryInfo,
	type QueryKey,
	queryOptions,
	type Recommended,
	retry,
	type RootOf,
	setData,
	waterfallHandle,
} from "./index.ts";
import { group, groups, tag } from "./groups.ts";
import { author, createBackend, featured, issues } from "./test-utils.ts";

const backend = createBackend();
const client = createQueryClient({ features: [groups()] });
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

describe("group keys", () => {
	it("type a group's path and the flat keys it builds", () => {
		const drafts = group(issues, "drafts");

		expectTypeOf(drafts.path).toEqualTypeOf<readonly ["issues", "drafts"]>();
		expectTypeOf(drafts("byId", 1)).toExtend<
			readonly ["issues", "drafts", "byId", 1]
		>();
		expectTypeOf(drafts("byId", 1)).toExtend<QueryKey>();
	});

	it("take only group-built keys in queryOptions", () => {
		const wrong = () => {
			queryOptions({
				queryFn: () => 1,
				// @ts-expect-error -- a hand-written key has no group
				queryKey: ["issues", "list"],
			});
			queryOptions({
				queryFn: () => 1,
				// @ts-expect-error -- nor does an `as const` one
				queryKey: ["issues", "list"] as const,
			});
			queryOptions({
				queryFn: () => 1,
				// @ts-expect-error -- a spread loses the brand
				queryKey: [...issues(), "list"],
			});
			// @ts-expect-error -- a subgroup's name is a string
			group(issues, 1);
		};
		expectTypeOf(wrong).toBeFunction();
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
			issue: ensureEntry(backend.issueQuery, { id: 1 }),
			settings: fetchEntry(settings),
			title: prefetchEntry(titles, { id: 1 }),
		});

		expectTypeOf(handles.issue).toEqualTypeOf<
			QueryHandle<typeof backend.issueQuery>
		>();
		expectTypeOf(handles.title).toEqualTypeOf<QueryHandle<typeof titles>>();
		expectTypeOf(data.settings).toEqualTypeOf<{ theme: string }>();
		expectTypeOf(data).not.toHaveProperty("title");
		// @ts-expect-error -- the input is required
		fetchEntry(titles);
		// @ts-expect-error -- the input has the factory's type
		fetchEntry(titles, { id: "1" });
	}
}

describe("waterfall types", () => {
	it("type waterfall handles like loaded ones", () => {
		const handle = waterfallHandle(titles, { id: 1 });

		expectTypeOf(handle).toEqualTypeOf<QueryHandle<typeof titles>>();
		expectTypeOf(waterfallHandle(titles, handle, { id: 2 })).toEqualTypeOf(
			handle,
		);
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
			ensured: ensureEntry(makeFactory("post", getPost), { id: 1 }),
			fetched: fetchEntry(makeFactory("post", getPost), { id: 1 }),
			prefetched: prefetchEntry(makeFactory("post", getPost), { id: 1 }),
		});
		const handle = waterfallHandle(makeFactory("post", getPost), { id: 1 });

		expectTypeOf(data.ensured).toEqualTypeOf<{ title: string }>();
		expectTypeOf(data.fetched).toEqualTypeOf<{ title: string }>();
		expectTypeOf(handles.prefetched.input).toEqualTypeOf<{
			readonly id: number;
		}>();
		expectTypeOf(handle.input).toEqualTypeOf<{ readonly id: number }>();
		await invalidateOne(client, makeFactory("post", getPost), { id: 1 });
		// @ts-expect-error -- the input still has the maker's type
		ensureEntry(makeFactory("post", getPost), { id: "1" });
		// @ts-expect-error -- and so does a waterfall handle's
		waterfallHandle(makeFactory("post", getPost), { id: "1" });
	});
});

describe("verb types", () => {
	it("check inputs, partial inputs and tag parameters", () => {
		void invalidateOne(client, titles, { id: 1 });
		void invalidateMany(client, author, "ada");
		void invalidateMany(client, author);
		void invalidateMany(client, titles, {});
		void invalidateMany(client, issues);
		void invalidateMany(client, featured);
		// @ts-expect-error -- a partial input still has the factory's types
		void invalidateMany(client, titles, { id: "1" });
		// @ts-expect-error -- a tag parameter is typed
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
			// @ts-expect-error -- nor are hand-written tuples: groups come from group()
			void invalidateMany(client, ["issues"] as const);
			// @ts-expect-error -- nor are keys
			void invalidateMany(client, issues("list"));
		};
		expectTypeOf(wrong).toBeFunction();
		expectTypeOf(author("ada")).toEqualTypeOf<string>();
	});

	it("type data before select", () => {
		expectTypeOf(getData(client, titles, { id: 1 })).toEqualTypeOf<
			{ title: string } | undefined
		>();
		setData(client, titles, { id: 1 }, (previous) => ({
			title: previous?.title ?? "",
		}));
	});
});

describe("root types", () => {
	const ownership = feature<{
		readonly meta: { readonly owner?: "posts-team" | "users-team" };
	}>();
	const makeQueryClient = () =>
		createQueryClient({
			features: [groups(), ownership],
			links: [retry()],
			staleTime: 30_000,
		});
	const posts = group("posts");
	const writer = tag<string>("writer");
	const postById = (input: {
		readonly authorId: string;
		readonly id: string;
	}) =>
		queryOptions({
			def: defType<typeof makeQueryClient>(),
			meta: {
				owner: "posts-team",
				retry: false,
				tags: [writer(input.authorId)],
			},
			queryFn: async () => ({ title: "x" }),
			queryKey: posts("byId", input),
		});

	it("give a root the meta its parts declare", () => {
		expectTypeOf<RootOf<typeof makeQueryClient>>().toEqualTypeOf<{
			readonly meta: {
				readonly owner: "posts-team" | "users-team" | undefined;
				readonly retry: number | false | undefined;
				readonly tags:
					| ReadonlyArray<string>
					| ((data: never) => ReadonlyArray<string>)
					| undefined;
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
			queryOptions({
				def: defType<typeof makeQueryClient>(),
				// @ts-expect-error -- no link or feature in the root reads `cacheFor`
				meta: { cacheFor: 1000 },
				queryFn: async () => 1,
				queryKey: posts("x"),
			});
			queryOptions({
				def: defType<typeof makeQueryClient>(),
				// @ts-expect-error -- meta fields have their part's types
				meta: { owner: "nobody" },
				queryFn: async () => 1,
				queryKey: posts("y"),
			});
		};
		expectTypeOf(wrong).toBeFunction();
		expectTypeOf(postById).returns.toHaveProperty("meta");
	});

	it("take the root's clients and targets", () => {
		const qc = makeQueryClient();
		void invalidateOne(qc, postById, { authorId: "a", id: "1" });
		void invalidateMany(qc, postById, { authorId: "a" });
		void invalidateMany(qc, posts);
		void invalidateMany(qc, writer, "a");
		void invalidateMany(qc, {
			where: (query: QueryInfo<{ readonly owner: string | undefined }>) =>
				query.meta.owner === "users-team",
		});
		void invalidateMany(qc, titles);
		const bare = createQueryClient({ links: [retry()] });
		const wrong = () => {
			// @ts-expect-error -- postById belongs to makeQueryClient's root
			void invalidateMany(bare, postById);
			// @ts-expect-error -- `writer` reads meta.tags, which nothing in this root declares
			void invalidateMany(bare, writer, "a");
		};
		void invalidateMany(bare, posts);
		expectTypeOf(wrong).toBeFunction();
	});

	it("check a bound action's targets against its client's root", () => {
		const qc = makeQueryClient();
		const save = async () => {};
		const owned = {
			where: (query: QueryInfo<{ readonly owner: string | undefined }>) =>
				query.meta.owner === "users-team",
		};
		action(save, { client: qc, invalidates: [posts, postById, writer, owned] });
		action(save, { invalidates: [writer, owned] });
		const bare = createQueryClient({ links: [retry()] });
		const wrong = () => {
			// @ts-expect-error -- `writer` reads meta.tags, which nothing in this root declares
			action(save, { client: bare, invalidates: [writer] });
			// @ts-expect-error -- nor does anything declare meta.owner
			action(save, { client: bare, invalidates: [owned] });
		};
		action(save, { client: bare, invalidates: [posts, titles] });
		expectTypeOf(wrong).toBeFunction();
	});

	it("keep roots apart when one has fewer parts", () => {
		const fewer = () => createQueryClient({ features: [groups()] });
		const more = () =>
			createQueryClient({ features: [groups()], links: [retry()] });
		const ofFewer = () =>
			queryOptions({
				def: defType<typeof fewer>(),
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
		void invalidateMany(anyClient, writer, "a");
		void invalidateMany(anyClient, postById);
		expectTypeOf(anyClient).toExtend<QueryClient>();
	});
});
