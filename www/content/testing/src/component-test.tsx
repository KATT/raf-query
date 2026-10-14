import { Suspense } from "react";
import { expect, test } from "vitest";
import { screen } from "@testing-library/react";

import { Post } from "./components/post";
import { postQuery } from "./queries";

declare let queryClient: import("@raf-query/react").QueryClient;
declare function renderWithClient(ui: React.ReactNode): Promise<void>;

// #region component
test("shows the post", async () => {
	const handle = queryClient.prefetch(postQuery, { slug: "hello" });

	await renderWithClient(
		<Suspense fallback="Loading…">
			<Post handle={handle} />
		</Suspense>,
	);

	expect((await screen.findByRole("heading")).textContent).toBe("Hello");
});
// #endregion
