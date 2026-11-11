import { describe, expectTypeOf, it } from "vitest";

import {
	bindInfiniteQueryOptions,
	bindQueryOptions,
	createQueryClient,
	type ClientFor,
	type DataOf,
	getData,
	group,
	infiniteQueryOptions,
	type InputOf,
	invalidateMany,
	invalidateOne,
	load,
	type Optional,
	type OptionsOf,
	part,
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
	type Retry,
	retry,
	revalidate,
	setData,
	skipToken,
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
	it("infer data and input", () => {
		expectTypeOf<DataOf<typeof backend.issueQuery>>().toEqualTypeOf<{
			readonly author: string;
			readonly id: number;
			readonly title: string;
		}>();
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
	{
		const isAdmin: boolean = Math.random() > 0.5;
		const [handles, data] = await load(client, {
			drafts: isAdmin ? prefetch(titles, { id: 1 }) : skipToken,
			issue: swr(backend.issueQuery, { id: 1 }),
			never: skipToken,
			settings: isAdmin ? revalidate(settings) : skipToken,
		});

		expectTypeOf(handles.drafts).toEqualTypeOf<
			QueryHandle<typeof titles> | undefined
		>();
		expectTypeOf(handles.settings).toEqualTypeOf<
			QueryHandle<typeof settings> | undefined
		>();
		expectTypeOf(handles.never).toEqualTypeOf<undefined>();
		expectTypeOf(handles.issue).toEqualTypeOf<
			QueryHandle<typeof backend.issueQuery>
		>();
		expectTypeOf(data).toEqualTypeOf<{
			readonly issue: DataOf<typeof backend.issueQuery>;
		}>();
		// @ts-expect-error -- a reader takes a handle, not `undefined`
		readHandle(handles.drafts);
		if (handles.drafts) {
			readHandle(handles.drafts);
		}
	}
}

declare function readHandle(handle: QueryHandle<typeof titles>): void;

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

	it("infer a factory a generic maker builds inline", () => {
		// Like an integration with one maker per backend function
		// (`queryFor(api.messages.list)`), called where the factory is passed.
		interface FunctionRef<TArgs, TResult> {
			readonly args?: TArgs;
			readonly name: string;
			readonly result?: TResult;
		}
		function queryFor<TArgs, TResult>(ref: FunctionRef<TArgs, TResult>) {
			return (args: TArgs) =>
				queryOptions({
					queryFn: (): Promise<TResult> => Promise.reject(new Error(ref.name)),
					queryKey: issues("fn", ref.name, args),
				});
		}
		const list: FunctionRef<
			{ readonly room: string },
			ReadonlyArray<string>
		> = {
			name: "messages:list",
		};
		setData(client, queryFor(list), { room: "a" }, ["hi"]);
		setData(client, queryFor(list), { room: "a" }, (previous) => [
			...(previous ?? []),
			"hi",
		]);
		expectTypeOf(getData(client, queryFor(list), { room: "a" })).toEqualTypeOf<
			ReadonlyArray<string> | undefined
		>();
		const wrong = () => {
			// @ts-expect-error -- the data is still checked
			setData(client, queryFor(list), { room: "a" }, [1]);
			// @ts-expect-error -- and so is the input
			setData(client, queryFor(list), { room: 1 }, ["hi"]);
		};
		expectTypeOf(wrong).toBeFunction();
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
	interface Ownership {
		readonly options: { readonly owner?: "posts-team" | "users-team" };
	}
	const ownership = part<Ownership>();
	interface Api {
		readonly context: { readonly api: (path: string) => Promise<string> };
	}
	const api = () => part<Api>({ context: { api: async (path) => path } });
	const makeQueryClient = () =>
		createQueryClient({
			defaults: { retry: 1, staleTime: 30_000 },
			parts: [retry(), ownership, api()],
		});
	const posts = group("posts");
	const writtenBy: Target<{ readonly owner: string | undefined }, string> = {
		where: (query, owner) => query.options.owner === owner,
	};
	const rootQueryOptions = bindQueryOptions<typeof makeQueryClient>();
	const postById = (input: {
		readonly authorId: string;
		readonly id: string;
	}) =>
		rootQueryOptions({
			owner: "posts-team",
			queryFn: async (context) => ({ title: await context.api(input.id) }),
			queryKey: posts("byId", input),
			retry: false,
		});

	it("give a root the options and context its parts declare", () => {
		expectTypeOf<RootOf<typeof makeQueryClient>>().toEqualTypeOf<{
			readonly context: {
				readonly api: (path: string) => Promise<string>;
			};
			readonly options: {
				readonly owner: "posts-team" | "users-team" | undefined;
				readonly retry: number | false | undefined;
			};
		}>();
		expectTypeOf<
			RootOf<ReturnType<typeof createQueryClient<Recommended>>>["options"]
		>().toEqualTypeOf<{
			readonly refetchInterval: number | false | undefined;
			readonly refetchOnReconnect: boolean | undefined;
			readonly refetchOnWindowFocus: boolean | undefined;
			readonly retry: number | false | undefined;
		}>();
		expectTypeOf<
			keyof RootOf<typeof createQueryClient<[]>>["options"]
		>().toEqualTypeOf<never>();
	});

	it("type a link's op, and a setup's client, by what the part declares", () => {
		interface Traced {
			readonly options: { readonly traceId?: string };
		}
		const tracedQueryOptions = bindQueryOptions<Traced>();
		const tracedQuery = () =>
			tracedQueryOptions({
				queryFn: () => 1,
				queryKey: posts("traced"),
				traceId: "t",
			});
		const traced = part<Traced>({
			link: (op, next) => {
				expectTypeOf(op.options.traceId).toEqualTypeOf<string | undefined>();
				expectTypeOf(op.options.staleTime).toEqualTypeOf<number | undefined>();
				return next(op);
			},
			setup: (tracedClient) => {
				void invalidateOne(tracedClient, tracedQuery);
			},
		});
		const qc = () => createQueryClient({ parts: [traced] });
		expectTypeOf<RootOf<typeof qc>["options"]>().toEqualTypeOf<{
			readonly traceId: string | undefined;
		}>();
	});

	it("need a part's context where it declares one: for the client, or from its link", () => {
		part<Api>({
			context: { api: async (path) => path },
			link: (op, next) => {
				expectTypeOf(op.context.api).toEqualTypeOf<
					((path: string) => Promise<string>) | undefined
				>();
				return next(op);
			},
		});
		const perRequest = part<Api>({
			link: (op, next) =>
				next({ ...op, context: { ...op.context, api: async (path) => path } }),
		});
		const qc = () => createQueryClient({ parts: [perRequest] });
		expectTypeOf<RootOf<typeof qc>["context"]>().toEqualTypeOf<{
			readonly api: (path: string) => Promise<string>;
		}>();
		const wrong = () => {
			// @ts-expect-error -- `Api` declares a context, so the part gives it
			part<Api>();
			// @ts-expect-error -- of its type
			part<Api>({ context: { api: 1 } });
			// @ts-expect-error -- a link that gives the context gives it to `next`
			part<Api>({ link: (op, next) => next(op) });
			part<Api>({
				link: (op, next) =>
					// @ts-expect-error -- of its type
					next({ ...op, context: { ...op.context, api: 1 } }),
			});
			part<Api>({
				context: { api: async (path) => path },
				link: (op, next) =>
					// @ts-expect-error -- a link changes only the context its part declares
					next({ ...op, context: { ...op.context, other: 1 } }),
			});
			// @ts-expect-error -- a part that declares no context gives none
			part<Ownership>({ context: { api: async () => "" } });
		};
		expectTypeOf(wrong).toBeFunction();
	});

	it("check options against the root", () => {
		const wrong = () => {
			rootQueryOptions({
				// @ts-expect-error -- no part of the root reads `cacheFor`
				cacheFor: 1000,
				queryFn: async () => 1,
				queryKey: posts("x"),
			});
			rootQueryOptions({
				// @ts-expect-error -- options have their part's types
				owner: "nobody",
				queryFn: async () => 1,
				queryKey: posts("y"),
			});
			rootQueryOptions({
				queryFn: async () => 1,
				queryKey: posts("z"),
				// @ts-expect-error -- a typo isn't an option the root declares
				retyr: 1,
			});
			rootQueryOptions({
				// @ts-expect-error -- `meta` isn't an option either
				meta: { retry: 1 },
				queryFn: async () => 1,
				queryKey: posts("meta"),
			});
		};
		expectTypeOf(wrong).toBeFunction();
	});

	it("take the core's options only on the unbound builders", () => {
		queryOptions({
			gcTime: 1000,
			queryFn: async (context) => {
				expectTypeOf(context).not.toHaveProperty("api");
				return 1;
			},
			queryKey: posts("unbound"),
			ssr: false,
			staleTime: Infinity,
			structuralSharing: false,
		});
		const wrong = () => {
			queryOptions({
				queryFn: async () => 1,
				queryKey: posts("unbound-retry"),
				// @ts-expect-error -- `retry` needs a builder bound to a client with `retry()`
				retry: false,
			});
			infiniteQueryOptions({
				getNextPageParam: () => null,
				initialPageParam: 0,
				queryFn: async () => 1,
				queryKey: posts("unbound-pages"),
				// @ts-expect-error -- on the paged builder too
				retry: false,
			});
		};
		expectTypeOf(wrong).toBeFunction();
	});

	it("type a client's defaults by its parts", () => {
		createQueryClient({
			defaults: { gcTime: 1000, owner: "users-team", retry: false },
			parts: [retry(), ownership],
		});
		const wrong = () => {
			createQueryClient({
				// @ts-expect-error -- no part of this client reads `retry`
				defaults: { retry: 1 },
				parts: [ownership],
			});
			createQueryClient({
				// @ts-expect-error -- defaults have their part's types
				defaults: { owner: "nobody" },
				parts: [ownership],
			});
		};
		expectTypeOf(wrong).toBeFunction();
	});

	it("type a fragment of options with OptionsOf", () => {
		const pinned = {
			retry: false,
			staleTime: Infinity,
		} satisfies OptionsOf<typeof makeQueryClient>;
		rootQueryOptions({
			...pinned,
			queryFn: async () => 1,
			queryKey: posts("pinned"),
		});
		expectTypeOf<OptionsOf<typeof makeQueryClient>>().toEqualTypeOf<
			OptionsOf<ReturnType<typeof makeQueryClient>>
		>();
		// @ts-expect-error -- a typo isn't an option the root declares
		const typo: OptionsOf<typeof makeQueryClient> = { retyr: 1 };
		expectTypeOf(typo).toBeObject();
	});

	it("bind infiniteQueryOptions to the root too", () => {
		const rootInfiniteQueryOptions =
			bindInfiniteQueryOptions<typeof makeQueryClient>();
		const postPages = () =>
			rootInfiniteQueryOptions({
				getNextPageParam: (page: number) => page + 1,
				initialPageParam: 0,
				owner: "posts-team",
				queryFn: async (context) => {
					expectTypeOf(context.api).toBeFunction();
					return context.pageParam;
				},
				queryKey: posts("pages"),
				retry: 1,
			});
		void invalidateOne(makeQueryClient(), postPages);
		const wrong = () => {
			rootInfiniteQueryOptions({
				// @ts-expect-error -- no part of the root reads `cacheFor`
				cacheFor: 1000,
				getNextPageParam: () => null,
				initialPageParam: 0,
				queryFn: async () => 1,
				queryKey: posts("wrong-pages"),
			});
			// @ts-expect-error -- a client without parts lacks what postPages needs
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
				query.options.owner === "users-team",
		});
		void invalidateMany(qc, titles);
		void load(qc, {
			post: swr(postById, { authorId: "a", id: "1" }),
			settings: prefetch(settings),
		});
		const bare = createQueryClient({ parts: [retry()] });
		const wrong = () => {
			// @ts-expect-error -- `bare` lacks parts postById needs
			void invalidateMany(bare, postById);
			// @ts-expect-error -- `writtenBy` reads `owner`, which nothing in this root declares
			void invalidateMany(bare, writtenBy, "a");
			void load(bare, {
				// @ts-expect-error -- `load` checks each entry's factory against the client too
				post: swr(postById, { authorId: "a", id: "1" }),
				settings: prefetch(settings),
			});
		};
		void invalidateMany(bare, posts);
		expectTypeOf(wrong).toBeFunction();
	});

	it("check a list's targets against the client's root", () => {
		const qc = makeQueryClient();
		const owned: Target<{ readonly owner: string | undefined }> = {
			where: (query) => query.options.owner === "users-team",
		};
		const ownedBy: Target<
			{ readonly owner: string | undefined },
			"posts-team" | "users-team"
		> = { where: (query, team) => query.options.owner === team };
		void invalidateMany(qc, [
			posts,
			postById,
			[postById, { authorId: "a" }],
			[writtenBy, "a"],
			owned,
			[ownedBy, "posts-team"],
			titles,
		]);
		const bare = createQueryClient({ parts: [retry()] });
		void invalidateMany(bare, [posts, titles, [titles, { id: 1 }]]);
		const wrong = () => {
			// @ts-expect-error -- `bare` lacks parts postById needs
			void invalidateMany(bare, [posts, postById]);
			// @ts-expect-error -- `writtenBy` reads `owner`, which nothing in this root declares
			void invalidateMany(bare, [[writtenBy, "a"]]);
			// @ts-expect-error -- nor does anything declare `owner`
			void resetMany(bare, [owned]);
			// @ts-expect-error -- a target that needs a parameter needs it in a list too
			void invalidateMany(qc, [ownedBy]);
			// @ts-expect-error -- of its type
			removeMany(qc, [[ownedBy, "nobody"]]);
		};
		expectTypeOf(wrong).toBeFunction();
	});

	it("run a factory on every client that has its parts", () => {
		const fewer = () => createQueryClient({ parts: [ownership] });
		const more = () => createQueryClient({ parts: [ownership, retry()] });
		const ofFewer = () =>
			bindQueryOptions<typeof fewer>()({
				owner: "users-team",
				queryFn: async () => 1,
				queryKey: group("fewer")(),
			});
		const ofMore = () =>
			bindQueryOptions<typeof more>()({
				queryFn: async () => 1,
				queryKey: group("more")(),
				retry: 1,
			});
		void invalidateMany(fewer(), ofFewer);
		void invalidateMany(more(), ofFewer);
		void invalidateMany(more(), [ofFewer, ofMore]);
		void load(more(), { fewer: swr(ofFewer), more: swr(ofMore) });
		const wrong = () => {
			// @ts-expect-error -- a client with fewer parts lacks `retry()`
			void invalidateMany(fewer(), ofMore);
			// @ts-expect-error -- in a list too
			void invalidateMany(fewer(), [ofFewer, ofMore]);
		};
		expectTypeOf(wrong).toBeFunction();
		expectTypeOf<ReturnType<typeof more>>().toExtend<
			ReturnType<typeof fewer>
		>();
		expectTypeOf<ReturnType<typeof fewer>>().not.toExtend<
			ReturnType<typeof more>
		>();
		expectTypeOf<ClientFor<typeof ofFewer>>().toEqualTypeOf<
			ReturnType<typeof fewer>
		>();
	});

	it("bind a library's builders to the parts it names", () => {
		const libraryQueryOptions = bindQueryOptions<Api & Optional<Retry>>();
		const libraryInfiniteQueryOptions = bindInfiniteQueryOptions<
			Api & Optional<Retry>
		>();
		const libraryQuery = (input: { readonly path: string }) =>
			libraryQueryOptions({
				queryFn: (context) => context.api(input.path),
				queryKey: posts("library", input),
				retry: false,
			});
		const libraryPages = () =>
			libraryInfiniteQueryOptions({
				getNextPageParam: () => null,
				initialPageParam: "",
				queryFn: (context) => context.api(context.pageParam),
				queryKey: posts("library-pages"),
				retry: false,
			});
		const withApi = createQueryClient({ parts: [api()] });
		const onlyRetry = createQueryClient({ parts: [retry()] });
		void invalidateOne(withApi, libraryQuery, { path: "/" });
		void invalidateOne(makeQueryClient(), libraryQuery, { path: "/" });
		void load(withApi, {
			one: swr(libraryQuery, { path: "/" }),
			pages: swr(libraryPages),
		});
		expectTypeOf<DataOf<typeof libraryQuery>>().toEqualTypeOf<string>();
		const wrong = () => {
			libraryQueryOptions({
				// @ts-expect-error -- the library named no part that reads `owner`
				owner: "posts-team",
				queryFn: () => 1,
				queryKey: posts("library-owner"),
			});
			// @ts-expect-error -- a client with `retry()` alone has no `api`
			void invalidateOne(onlyRetry, libraryQuery, { path: "/" });
		};
		expectTypeOf(wrong).toBeFunction();
	});

	it("take any client as a bare QueryClient, which runs only what needs no part", () => {
		const anyClient: QueryClient = makeQueryClient();
		void invalidateMany(anyClient, posts);
		void invalidateMany(anyClient, settings);
		void invalidateMany(anyClient, featured);
		const wrong = () => {
			// @ts-expect-error -- any client may lack the parts postById needs
			void invalidateMany(anyClient, postById);
			// @ts-expect-error -- or the option `writtenBy` reads
			void invalidateMany(anyClient, writtenBy, "a");
		};
		expectTypeOf(wrong).toBeFunction();
		expectTypeOf(anyClient).toExtend<QueryClient>();
	});
});
