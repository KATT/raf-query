/* oxlint-disable vitest/no-hooks -- documents a shared test harness */
import { act, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach } from "vitest";

import { QueryClient, QueryClientProvider } from "@raf-query/react";

// #region client
let queryClient: QueryClient;

beforeEach(() => {
	queryClient = new QueryClient({ defaults: { retry: false } });
});

afterEach(async () => {
	await queryClient.dispose();
});

function renderWithClient(ui: ReactNode) {
	return act(async () =>
		render(
			<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
		),
	);
}
// #endregion

void renderWithClient;
