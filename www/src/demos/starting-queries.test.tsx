import { describe, expect, it, onTestFinished, vi } from "@effect/vitest";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";

import { DemoFrame } from "~/demo-kit/frame.tsx";
import demo from "./starting-queries.tsx";

function serverOf(label: string) {
	const variant = demo.variants.find((each) => each.label === label);
	if (!variant) {
		throw new Error(`No variant ${label}`);
	}
	return variant.server;
}

function requestsOf(label: string) {
	return serverOf(label)
		.getRequests()
		.map((request) => `${request.label} ${request.status}`);
}

async function click(element: HTMLElement) {
	await act(async () => {
		fireEvent.click(element);
	});
}

async function renderDemo() {
	for (const variant of demo.variants) {
		variant.server.latency = 40;
	}
	onTestFinished(cleanup);
	await act(async () => {
		render(<DemoFrame demo={demo} />);
	});
	// Sessions outlive a render, as on the page, so start each test from
	// Reset's fresh clients and servers.
	await click(screen.getByRole("button", { name: "Reset" }));
}

function selectVariant(label: string) {
	return click(screen.getByRole("radio", { name: label }));
}

function openPost(title: string) {
	return click(screen.getByRole("link", { name: title }));
}

function comments() {
	return within(screen.getByRole("region", { name: "Comments" }));
}

describe("prefetch, ensure or fetch", () => {
	it("prefetch opens the post at once, with skeletons", async () => {
		await renderDemo();

		await openPost("Render-as-you-fetch, explained");

		expect(
			screen.queryByRole("link", { name: "Render-as-you-fetch, explained" }),
		).toBeNull();
		expect(comments().queryAllByRole("listitem")).toHaveLength(0);
		expect(requestsOf("prefetch")).toEqual([
			"GET /posts/1/comments pending",
			"GET /posts/1 pending",
		]);

		await screen.findByRole("heading", {
			name: "Render-as-you-fetch, explained",
		});
		expect(await comments().findAllByRole("listitem")).toHaveLength(3);
	});

	it("ensure stays on the list until the post and its comments load", async () => {
		await renderDemo();
		await selectVariant("ensure");

		await openPost("Why loaders beat effects");

		expect(
			screen.getByRole("link", { name: "Why loaders beat effects" }),
		).toBeTruthy();
		expect(requestsOf("ensure")).toEqual([
			"GET /posts/2/comments pending",
			"GET /posts/2 pending",
		]);

		await screen.findByRole("heading", { name: "Why loaders beat effects" });
		expect(comments().getAllByRole("listitem")).toHaveLength(4);
		expect(comments().getByText("Grace")).toBeTruthy();
	});

	it("ensure reopens a stale post at once and refetches in the background", async () => {
		await renderDemo();
		await selectVariant("ensure");
		await openPost("Why loaders beat effects");
		await screen.findByRole("heading", { name: "Why loaders beat effects" });
		await click(screen.getByRole("link", { name: "← All posts" }));
		vi.useFakeTimers({ toFake: ["Date"] });
		onTestFinished(() => {
			vi.useRealTimers();
		});
		vi.setSystemTime(Date.now() + 5000);

		await openPost("Why loaders beat effects");

		expect(
			screen.getByRole("heading", { name: "Why loaders beat effects" }),
		).toBeTruthy();
		expect(requestsOf("ensure").slice(2)).toEqual([
			"GET /posts/2/comments pending",
			"GET /posts/2 pending",
		]);
	});

	it("fetch waits for the refetch when reopening a stale post", async () => {
		await renderDemo();
		await selectVariant("fetch");
		await openPost("Why loaders beat effects");
		await screen.findByRole("heading", { name: "Why loaders beat effects" });
		expect(comments().getAllByRole("listitem")).toHaveLength(4);
		await click(screen.getByRole("link", { name: "← All posts" }));
		vi.useFakeTimers({ toFake: ["Date"] });
		onTestFinished(() => {
			vi.useRealTimers();
		});
		vi.setSystemTime(Date.now() + 5000);

		await openPost("Why loaders beat effects");

		expect(
			screen.queryByRole("heading", { name: "Why loaders beat effects" }),
		).toBeNull();
		expect(requestsOf("fetch").slice(2)).toEqual([
			"GET /posts/2/comments pending",
			"GET /posts/2 pending",
		]);
		await screen.findByRole("heading", { name: "Why loaders beat effects" });
	});

	it("keeps each variant's page and requests while another is shown", async () => {
		await renderDemo();
		await openPost("Render-as-you-fetch, explained");
		await screen.findByRole("heading", {
			name: "Render-as-you-fetch, explained",
		});

		await selectVariant("ensure");

		expect(
			screen.getByRole("link", { name: "Render-as-you-fetch, explained" }),
		).toBeTruthy();
		expect(screen.getByText("No requests yet.", { exact: false })).toBeTruthy();
		expect(requestsOf("ensure")).toEqual([]);

		await selectVariant("prefetch");

		expect(
			screen.getByRole("heading", { name: "Render-as-you-fetch, explained" }),
		).toBeTruthy();
		expect(
			within(screen.getByRole("list", { name: "Requests" })).getAllByRole(
				"listitem",
			),
		).toHaveLength(2);
		expect(requestsOf("prefetch")).toEqual([
			"GET /posts/1/comments success",
			"GET /posts/1 success",
		]);
	});

	it("Reset starts every variant over and keeps the selection", async () => {
		await renderDemo();
		await openPost("Render-as-you-fetch, explained");
		await selectVariant("ensure");
		await openPost("Why loaders beat effects");
		await screen.findByRole("heading", { name: "Why loaders beat effects" });

		await click(screen.getByRole("button", { name: "Reset" }));

		expect(
			screen.getByRole<HTMLInputElement>("radio", { name: "ensure" }).checked,
		).toBe(true);
		expect(
			screen.getByRole("link", { name: "Why loaders beat effects" }),
		).toBeTruthy();
		expect(requestsOf("ensure")).toEqual([]);
		expect(requestsOf("prefetch")).toEqual([]);

		await selectVariant("prefetch");

		expect(
			screen.getByRole("link", { name: "Render-as-you-fetch, explained" }),
		).toBeTruthy();
	});
});
