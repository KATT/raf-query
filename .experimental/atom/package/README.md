# @raf-query/experimental-atom

Typed error boundaries for [Effect Atom](https://github.com/Effect-TS/effect/tree/main/packages/atom/react) (`@effect/atom-react`). Each boundary owns some errors for the tree under it. A component that reads an atom through `useAtomResult` with a boundary's claims gets an `AsyncResult` typed without the errors the boundaries above it own, so it only matches what is left. The errors come from the atom's Effect: nothing is declared.

```tsx
import { RegistryProvider } from "@effect/atom-react";
import {
	createErrorBoundary,
	useAtomResult,
} from "@raf-query/experimental-atom";
import { AsyncResult } from "effect/reactivity";

// issueAtom: (id: number) => Atom<AsyncResult<Issue, IssueNotFound | Unauthorized | Offline>>

const [OfflineBoundary] = createErrorBoundary({
	name: "Offline",
	claims: [Offline],
	fallback: ({ reset }) => <button onClick={reset}>Reconnect</button>,
});
const [AuthBoundary, useAuthBoundary] = createErrorBoundary({
	name: "Auth",
	parent: OfflineBoundary,
	claims: [Unauthorized],
	fallback: ({ error, reset }) => (
		<SignIn reason={error.reason} onDone={reset} />
	),
	//            ^? Unauthorized
});

function IssueTitle(props: { id: number }) {
	const issue = useAtomResult(issueAtom(props.id), useAuthBoundary());
	//    ^? Success<Issue, IssueNotFound> | Failure<Issue, IssueNotFound>
	return AsyncResult.match(issue, {
		onFailure: () => <p>No such issue</p>,
		onSuccess: ({ value }) => <h1>{value.title}</h1>,
		onInitial: () => null,
	});
}

<RegistryProvider>
	<OfflineBoundary>
		<AuthBoundary>
			<Suspense fallback={<Spinner />}>
				<IssueTitle id={1} />
			</Suspense>
		</AuthBoundary>
	</OfflineBoundary>
</RegistryProvider>;
```

- `claims` are classes or type guards, checked at runtime: a fallback's `error` is what its boundary claims, and a boundary re-throws anything else to the boundaries above it.
- `parent` is the boundary it sits under. Its owned errors add up along the chain, and it must be mounted above. A boundary's hook throws outside its boundary.
- `useAtomResult(atom, claims, { suspendOnWaiting })` suspends like `useAtomSuspense`. A failure with an owned error throws to the boundary that claims it; another typed failure is returned. A defect or an interruption isn't a typed error, so it throws to the app's own error boundary.
- `reset` refreshes the atom whose failure the fallback shows, then renders the children again.
