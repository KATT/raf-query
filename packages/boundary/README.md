# @raf-query/boundary

`QueryBoundary` catches a query's expected errors (`fail()` values) by tag, with handlers typed from the query, and shows a Suspense fallback while it loads. Anything else goes to the next error boundary.

```tsx
import { QueryBoundary } from "@raf-query/boundary";

<QueryBoundary
	query={issueQuery}
	catch={{ NotFound: (error) => <p>No issue {error.id}</p> }}
	fallback={<IssueSkeleton />}
>
	<Issue handle={handles.issue} />
</QueryBoundary>;
```

See [expected errors](https://raf-query.katt.dev/docs/query-functions#expected-errors) in the docs.
