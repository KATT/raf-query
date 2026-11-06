import { describe, expectTypeOf, it } from "vitest";

import { createQueryClient } from "./client.ts";
import type { Fail } from "./fail.ts";
import { type Tag, tagged } from "./keys.ts";
import {
	type DefinedQueryHandle,
	ensureEntry,
	fetchEntry,
	load,
	prefetchEntry,
	type QueryHandle,
	waterfallHandle,
} from "./load.ts";
import {
	type DataOf,
	type ErrorOf,
	type InputOf,
	queryOptions,
} from "./options.ts";
import { author, createBackend, featured, issues } from "./test-utils.ts";
import { getData, invalidateMany, invalidateOne, setData } from "./verbs.ts";

const backend = createBackend();
const client = createQueryClient();
const settings = () =>
	queryOptions({
		queryFn: () => ({ theme: "dark" }),
		queryKey: [issues, "settings"],
	});
const titles = (input: { readonly id: number }) =>
	queryOptions({
		queryFn: () => ({ title: `${input.id}` }),
		queryKey: [issues, "title", input],
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
			DefinedQueryHandle<typeof backend.issueQuery>
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

describe("verb types", () => {
	it("check inputs, partial inputs and tag parameters", () => {
		void invalidateOne(client, titles, { id: 1 });
		void invalidateOne(client, author, "ada");
		void invalidateMany(client, titles, {});
		void invalidateMany(client, issues);
		void invalidateMany(client, featured);
		// @ts-expect-error -- a partial input still has the factory's types
		void invalidateMany(client, titles, { id: "1" });
		// @ts-expect-error -- a tag parameter has its key's type
		void invalidateOne(client, author, 1);
		// @ts-expect-error -- invalidateOne needs the full input
		void invalidateOne(client, titles);
		expectTypeOf(tagged(author, "ada")).toEqualTypeOf<Tag>();
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
