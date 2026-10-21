import { describe, expect, it } from "@effect/vitest";
import { Cause } from "effect";

import { type Link, route } from "../src/route.ts";
import { Forbidden, NotFound, Unauthorized } from "./fixtures.ts";

const root: Link = { errors: [], name: "Root", parent: undefined };
const auth: Link = { errors: [Unauthorized], name: "Auth", parent: root };
const doc: Link = { errors: [Forbidden], name: "Doc", parent: auth };

describe("route", () => {
	it("sends a typed failure to the innermost boundary that catches it", () => {
		expect(route(doc, Cause.fail(new Forbidden({ id: 1 })))).toEqual({
			boundary: doc,
			error: new Forbidden({ id: 1 }),
			kind: "caught",
		});
		expect(route(doc, Cause.fail(new Unauthorized()))).toMatchObject({
			boundary: auth,
			kind: "caught",
		});
	});

	it("only looks at the chain it was given", () => {
		expect(route(auth, Cause.fail(new Forbidden({ id: 1 })))).toEqual({
			error: new Forbidden({ id: 1 }),
			kind: "uncaught",
		});
	});

	it("hands back a typed failure no boundary catches", () => {
		expect(route(doc, Cause.fail(new NotFound({ id: 1 }))).kind).toBe(
			"uncaught",
		);
	});

	it("matches the schema, not just the tag", () => {
		expect(route(doc, Cause.fail({ _tag: "Forbidden", id: 1 })).kind).toBe(
			"uncaught",
		);
	});

	it("sends defects and interrupts to the root", () => {
		expect(route(doc, Cause.die(new Forbidden({ id: 1 }))).kind).toBe("defect");
		expect(route(doc, Cause.interrupt()).kind).toBe("defect");
	});
});
