import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { Suspense } from "react";

import {
	QueryClient,
	QueryClientProvider,
	queryOptions,
	type Thenable,
	track,
	unwrap,
	useQuery,
} from "./index.ts";

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

		await act(async () =>
			render(
				<Suspense fallback={<p>Loading</p>}>
					<Title title={deferred.promise} />
				</Suspense>,
			),
		);
		expect(screen.getByText("Loading")).toBeTruthy();

		await act(async () => {
			deferred.resolve("Hello");
			await deferred.promise;
		});
		expect(screen.getByText("Hello")).toBeTruthy();
		cleanup();
	});

	it("reads cached query data without suspending", async () => {
		const client = new QueryClient({ isServer: false });
		const titleQuery = () =>
			queryOptions({
				queryFn: () => "Fetched",
				queryKey: ["title"],
				staleTime: Infinity,
			});
		client.setData(titleQuery, undefined, "Cached");
		const handle = client.prefetch(titleQuery);
		let clicked: string | undefined;
		function Title() {
			const [titlePromise] = useQuery(titleQuery, handle);
			expectTypeOf(titlePromise).toEqualTypeOf<Thenable<string>>();
			return (
				<button
					onClick={() => {
						clicked = unwrap(titlePromise);
					}}
					type="button"
				>
					{unwrap(titlePromise)}
				</button>
			);
		}

		await act(async () =>
			render(
				<QueryClientProvider client={client}>
					<Suspense fallback={<p>Loading</p>}>
						<Title />
					</Suspense>
				</QueryClientProvider>,
			),
		);
		const button = screen.getByText("Cached");
		await act(async () => {
			button.click();
		});

		expect(clicked).toBe("Cached");
		cleanup();
	});
});
