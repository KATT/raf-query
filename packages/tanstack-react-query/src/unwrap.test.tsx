import { act, cleanup, screen } from "@testing-library/react";
import { Suspense } from "react";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
	prefetch,
	QueryClient,
	QueryClientProvider,
	setData,
	type Thenable,
	track,
	unwrap,
	useQuery,
} from "./index.ts";
import { createBackend, type Issue, mount } from "./test-utils.tsx";

describe("unwrap", () => {
	it("returns a fulfilled thenable's value outside render", async () => {
		const thenable = track(Promise.resolve(1));
		await thenable;

		expect(unwrap(thenable)).toBe(1);
	});

	it("throws a rejected thenable's reason outside render", async () => {
		const error = new Error("nope");
		const thenable = track(Promise.reject(error));
		await thenable.catch(() => {});

		expect(() => unwrap(thenable)).toThrow(error);
	});

	it("suspends on a plain promise until it settles", async () => {
		const deferred = Promise.withResolvers<string>();
		function Title(props: { readonly title: Promise<string> }) {
			return <p>{unwrap(props.title)}</p>;
		}

		await mount(
			<Suspense fallback={<p>Loading</p>}>
				<Title title={deferred.promise} />
			</Suspense>,
		);
		expect(screen.getByText("Loading")).toBeDefined();

		await act(async () => {
			deferred.resolve("Hello");
			await deferred.promise;
		});
		expect(screen.getByText("Hello")).toBeDefined();
		cleanup();
	});

	it("reads cached query data without suspending", async () => {
		const backend = createBackend();
		const client = new QueryClient();
		setData(
			client,
			backend.issueQuery,
			{ id: 1 },
			{ assigneeId: 10, id: 1, title: "Cached" },
		);
		const handle = prefetch(client, backend.issueQuery, { id: 1 });
		function Title() {
			const [issuePromise] = useQuery(backend.issueQuery, handle);
			expectTypeOf(issuePromise).toEqualTypeOf<Thenable<Issue>>();
			return <p>{unwrap(issuePromise).title}</p>;
		}

		await mount(
			<QueryClientProvider client={client}>
				<Suspense fallback={<p>Loading</p>}>
					<Title />
				</Suspense>
			</QueryClientProvider>,
		);

		expect(screen.getByText("Cached")).toBeDefined();
		cleanup();
	});
});
