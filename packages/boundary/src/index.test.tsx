import {
	createQueryClient,
	fail,
	type Group,
	type QueryClient,
	queryOptions,
	waterfallHandle,
} from "@raf-query/core";
import { QueryClientProvider, useQuery } from "@raf-query/react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Component, type ReactNode, use } from "react";
import { describe, expect, it, vi } from "vitest";

import { QueryBoundary } from "./index.tsx";

const issues: Group = { group: "issues" };

function createBackend() {
	const titles = new Map<number, string>([[1, "First"]]);
	let calls = 0;
	const issueQuery = (input: { readonly id: number }) =>
		queryOptions({
			queryFn: async () => {
				calls += 1;
				const title = titles.get(input.id);
				if (title === "defect") {
					throw new Error("defect");
				}
				return title ?? fail({ _tag: "NotFound", id: input.id });
			},
			queryKey: [issues, "byId", input],
		});
	return { calls: () => calls, issueQuery, titles };
}

type Backend = ReturnType<typeof createBackend>;

function Issue(props: { readonly backend: Backend; readonly id: number }) {
	const [read] = useQuery(
		props.backend.issueQuery,
		waterfallHandle(props.backend.issueQuery, { id: props.id }),
	);
	const title = use(read);
	return <p>{title}</p>;
}

interface OuterState {
	readonly error?: unknown;
}

class Outer extends Component<{ readonly children?: ReactNode }, OuterState> {
	static getDerivedStateFromError(error: unknown) {
		return { error };
	}

	override state: OuterState = {};

	override render() {
		return this.state.error === undefined ? (
			this.props.children
		) : (
			<p>outer caught</p>
		);
	}
}

async function show(client: QueryClient, ui: ReactNode) {
	await act(async () => {
		render(
			<QueryClientProvider client={client}>
				<Outer>{ui}</Outer>
			</QueryClientProvider>,
		);
	});
}

function flush() {
	return act(
		() =>
			new Promise<void>((resolve) => {
				setTimeout(resolve, 0);
			}),
	);
}

describe("QueryBoundary", () => {
	it("shows the fallback, then the children", async () => {
		const backend = createBackend();
		await show(
			createQueryClient({ isServer: false }),
			<QueryBoundary fallback={<p>loading</p>} query={backend.issueQuery}>
				<Issue backend={backend} id={1} />
			</QueryBoundary>,
		);
		await flush();
		expect(screen.getByText("First")).toBeTruthy();
	});

	it("renders the handler for a declared tag, and retries", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const backend = createBackend();
		await show(
			createQueryClient({ isServer: false }),
			<QueryBoundary
				catch={{
					NotFound: (error, retry) => (
						<button onClick={retry} type="button">
							missing {error.id}
						</button>
					),
				}}
				fallback={<p>loading</p>}
				query={backend.issueQuery}
			>
				<Issue backend={backend} id={2} />
			</QueryBoundary>,
		);
		await flush();
		backend.titles.set(2, "Found");
		await act(async () => {
			fireEvent.click(screen.getByText("missing 2"));
		});
		await flush();
		expect(screen.getByText("Found")).toBeTruthy();
		expect(backend.calls()).toBe(2);
	});

	it("passes defects and undeclared tags to the next boundary", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const backend = createBackend();
		backend.titles.set(3, "defect");
		await show(
			createQueryClient({ isServer: false }),
			<QueryBoundary fallback={<p>loading</p>}>
				<Issue backend={backend} id={3} />
			</QueryBoundary>,
		);
		await flush();
		expect(screen.getByText("outer caught")).toBeTruthy();
	});

	it("handles a fail() value thrown outside a query", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		let thrown = true;
		function Thrower() {
			if (thrown) {
				throw fail({ _tag: "Denied" });
			}
			return <p>allowed</p>;
		}
		await show(
			createQueryClient({ isServer: false }),
			<QueryBoundary
				catch={{
					Denied: (_error, retry) => (
						<button onClick={retry} type="button">
							denied
						</button>
					),
				}}
			>
				<Thrower />
			</QueryBoundary>,
		);
		thrown = false;
		await act(async () => {
			fireEvent.click(screen.getByText("denied"));
		});
		expect(screen.getByText("allowed")).toBeTruthy();
	});
});
