import { act, fireEvent, screen } from "@testing-library/react";
import { use } from "react";
import { describe, expect, it, vi } from "vitest";

import {
	fetchEntry,
	load,
	type QueryHandle,
	useInfiniteQuery,
} from "./index.ts";
import { createBackend, flush, renderWith, testClient } from "./test-utils.tsx";

type Backend = ReturnType<typeof createBackend>;

async function loaded(backend: Backend, run: () => Promise<void>) {
	const done = run();
	await backend.respondAll();
	await done;
}

describe("useInfiniteQuery", () => {
	it("pages through a paged query", async () => {
		const backend = createBackend();
		const client = testClient();
		let handles!: { readonly pages: QueryHandle<Backend["pageQuery"]> };
		await loaded(backend, async () => {
			[handles] = await load(client, {
				pages: fetchEntry(backend.pageQuery, { size: 2 }),
			});
		});
		const settled = vi.fn();
		function Pages() {
			const [pagesThenable, controls] = useInfiniteQuery(
				backend.pageQuery,
				handles.pages,
			);
			const data = use(pagesThenable);
			return (
				<>
					<p>{data.pages.flat().join(",")}</p>
					<p>
						{String(controls.hasPreviousPage)} {String(controls.hasNextPage)}
					</p>
					<p>
						{String(controls.isFetchingPreviousPage)}{" "}
						{String(controls.isFetchingNextPage)}
					</p>
					<button
						onClick={() => void controls.fetchNextPage().then(settled)}
						type="button"
					>
						next
					</button>
					<button
						onClick={() => void controls.fetchPreviousPage().then(settled)}
						type="button"
					>
						previous
					</button>
				</>
			);
		}
		await renderWith(client, <Pages />);
		expect(screen.getByText("1,1")).toBeTruthy();
		expect(screen.getByText("true true")).toBeTruthy();
		await act(async () => {
			fireEvent.click(screen.getByText("next"));
			await flush();
		});
		expect(screen.getByText("false true")).toBeTruthy();
		await backend.respondAll();
		await act(async () => {
			fireEvent.click(screen.getByText("previous"));
			await flush();
		});
		expect(screen.getByText("true false")).toBeTruthy();
		await backend.respondAll();
		expect(screen.getByText("0,0,1,1,2,2")).toBeTruthy();
		expect(settled).toHaveBeenCalledTimes(2);
	});
});
