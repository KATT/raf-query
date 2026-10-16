import { describe, expect, it } from "@effect/vitest";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";

import { DemoFrame, resetSessions } from "~/demo-kit/frame.tsx";
import demo from "./pagination.tsx";

function requests() {
	return (demo.variants[0]?.server.getRequests() ?? []).map(
		(request) => `${request.label} ${request.status}`,
	);
}

async function click(element: HTMLElement) {
	await act(async () => {
		fireEvent.click(element);
	});
}

async function renderDemo(): Promise<Disposable> {
	resetSessions(demo);
	for (const variant of demo.variants) {
		variant.server.latency = 40;
	}
	await act(async () => {
		render(<DemoFrame demo={demo} />);
	});
	return { [Symbol.dispose]: cleanup };
}

describe("Paginated list with whilePending", () => {
	it("switching whilePending starts over from page 1 with an empty cache", async () => {
		using _demo = await renderDemo();
		await screen.findByText("Project 01");
		await click(screen.getByRole("link", { name: "Next →" }));
		await screen.findByText("Project 05");
		expect(requests()).toEqual([
			"GET /projects?page=1 success",
			"GET /projects?page=2 success",
		]);

		await click(screen.getByRole("radio", { name: '"suspend"' }));

		expect(requests()).toEqual(["GET /projects?page=1 pending"]);
		await screen.findByText("Project 01");
		await click(screen.getByRole("link", { name: "Next →" }));

		expect(requests()).toEqual([
			"GET /projects?page=1 success",
			"GET /projects?page=2 pending",
		]);
		expect(screen.getByText("Project 01")).toBeTruthy();
		await screen.findByText("Project 05");
	});
});
