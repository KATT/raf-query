import { RegistryContext } from "@effect/atom-react";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { Data, Effect } from "effect";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import * as Atom from "effect/reactivity/Atom";
import * as AtomRegistry from "effect/reactivity/AtomRegistry";
import { Component, type ReactNode, Suspense } from "react";

import { createErrorBoundary, useAtomResult } from "./index.ts";

class Offline extends Data.TaggedError("Offline") {}
class Unauthorized extends Data.TaggedError("Unauthorized") {}
class IssueNotFound extends Data.TaggedError("IssueNotFound")<{
	readonly id: number;
}> {}

type Outcome = "crash" | "found" | "missing" | "offline" | "signed-out";

function createBackend() {
	const outcomes = new Map<number, Outcome>();
	const requests = { count: 0 };
	const issueAtom = Atom.family((id: number) =>
		Atom.make(
			Effect.gen(function* () {
				requests.count++;
				yield* Effect.sleep("1 millis");
				switch (outcomes.get(id) ?? "found") {
					case "crash":
						return yield* Effect.die("the server crashed");
					case "missing":
						return yield* Effect.fail(new IssueNotFound({ id }));
					case "offline":
						return yield* Effect.fail(new Offline());
					case "signed-out":
						return yield* Effect.fail(new Unauthorized());
					case "found":
						return { id, title: `Issue ${id}` };
				}
			}),
		),
	);
	return { issueAtom, outcomes, requests };
}

const [OfflineBoundary, useOfflineBoundary] = createErrorBoundary({
	claims: [Offline],
	fallback: () => <p>Offline</p>,
	name: "Offline",
});

const [AuthBoundary, useAuthBoundary] = createErrorBoundary({
	claims: [Unauthorized],
	fallback: (props) => {
		expectTypeOf(props.error).toEqualTypeOf<Unauthorized>();
		return (
			<button onClick={props.reset} type="button">
				Signed out
			</button>
		);
	},
	name: "Auth",
	parent: OfflineBoundary,
});

interface OuterState {
	readonly error: unknown;
}

class Outer extends Component<{ readonly children: ReactNode }, OuterState> {
	override state: OuterState = { error: null };
	static getDerivedStateFromError(error: unknown) {
		return { error };
	}
	override render() {
		if (this.state.error !== null) {
			return <p>{`Outer: ${String(this.state.error)}`}</p>;
		}
		return this.props.children;
	}
}

async function settle() {
	await act(async () => {
		await new Promise((resolve) => {
			setTimeout(resolve, 20);
		});
	});
}

function setup() {
	const backend = createBackend();
	const registry = AtomRegistry.make();
	function Title(props: { readonly id: number }) {
		const issue = useAtomResult(backend.issueAtom(props.id), useAuthBoundary());
		expectTypeOf(issue).toEqualTypeOf<
			| AsyncResult.Failure<{ id: number; title: string }, IssueNotFound>
			| AsyncResult.Success<{ id: number; title: string }, IssueNotFound>
		>();
		if (AsyncResult.isFailure(issue)) {
			const error = AsyncResult.error(issue);
			return <p>{`No issue ${error._tag === "Some" ? error.value.id : ""}`}</p>;
		}
		return <p>{issue.value.title}</p>;
	}
	async function mount(id: number) {
		await act(async () => {
			render(
				<RegistryContext.Provider value={registry}>
					<Outer>
						<OfflineBoundary>
							<AuthBoundary>
								<Suspense fallback={<p>Loading</p>}>
									<Title id={id} />
								</Suspense>
							</AuthBoundary>
						</OfflineBoundary>
					</Outer>
				</RegistryContext.Provider>,
			);
		});
		await settle();
	}
	return { backend, mount, registry };
}

describe("createErrorBoundary for atoms", () => {
	it("keeps an error no boundary owns in the result", async () => {
		const test = setup();
		test.backend.outcomes.set(1, "missing");
		await test.mount(1);
		expect(screen.getByText("No issue 1")).toBeDefined();
		cleanup();
	});

	it("throws an owned error to the boundary that claims it", async () => {
		const test = setup();
		test.backend.outcomes.set(1, "signed-out");
		await test.mount(1);
		expect(screen.getByText("Signed out")).toBeDefined();
		cleanup();
	});

	it("re-throws to the parent what only the parent claims", async () => {
		const test = setup();
		test.backend.outcomes.set(1, "offline");
		await test.mount(1);
		expect(screen.getByText("Offline")).toBeDefined();
		cleanup();
	});

	it("throws a defect to the app's error boundary", async () => {
		const test = setup();
		test.backend.outcomes.set(1, "crash");
		await test.mount(1);
		expect(screen.getByText("Outer: the server crashed")).toBeDefined();
		cleanup();
	});

	it("refreshes the atom that failed on reset", async () => {
		const test = setup();
		test.backend.outcomes.set(1, "signed-out");
		await test.mount(1);
		expect(test.backend.requests.count).toBe(1);
		test.backend.outcomes.set(1, "found");
		await act(async () => {
			screen.getByText("Signed out").click();
		});
		await settle();
		expect(screen.getByText("Issue 1")).toBeDefined();
		expect(test.backend.requests.count).toBe(2);
		cleanup();
	});

	it("renders the result without a request per boundary", async () => {
		const test = setup();
		await test.mount(1);
		expect(screen.getByText("Issue 1")).toBeDefined();
		expect(test.backend.requests.count).toBe(1);
		cleanup();
	});

	it("needs its boundary, and its parent, mounted above", async () => {
		function Lonely() {
			useOfflineBoundary();
			return null;
		}
		await act(async () => {
			render(
				<Outer>
					<Lonely />
				</Outer>,
			);
		});
		expect(
			screen.getByText(/found no <OfflineBoundary> above it/),
		).toBeDefined();
		cleanup();
		await act(async () => {
			render(
				<Outer>
					<AuthBoundary />
				</Outer>,
			);
		});
		expect(
			screen.getByText(
				/<AuthBoundary> needs <OfflineBoundary>, its parent, above it/,
			),
		).toBeDefined();
		cleanup();
	});
});
