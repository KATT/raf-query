/**
 * The API's handlers, running in the browser. They read the chaos panel's
 * settings to decide how to fail.
 */
import { Effect, Layer } from "effect";

import {
	CurrentUser,
	DocNotFound,
	DocRpcs,
	EmptyTitle,
	Forbidden,
	Session,
	Unauthorized,
} from "./api.ts";
import { getChaos } from "./chaos.ts";

interface Row {
	body: string;
	title: string;
	updatedBy: string;
}

const rows = new Map<number, Row>([
	[
		1,
		{
			body: "Boundaries are Effect.catchTags laid over the component tree.",
			title: "Design notes",
			updatedBy: "Ada",
		},
	],
	[
		2,
		{
			body: "Typed failures route to the innermost boundary that catches them.",
			title: "Routing",
			updatedBy: "Grace",
		},
	],
	[
		3,
		{
			body: "Only the people on the payroll can read this one.",
			title: "Salaries",
			updatedBy: "Barbara",
		},
	],
	[
		4,
		{
			body: "Defects skip every typed boundary and land on the root.",
			title: "Defects",
			updatedBy: "Edsger",
		},
	],
]);

const latency = Effect.suspend(() => Effect.sleep(getChaos().latency));

const find = (id: number) =>
	Effect.gen(function* () {
		const chaos = getChaos();
		if (chaos.locked.has(id)) {
			return yield* new Forbidden({ docId: id });
		}
		const row = rows.get(id);
		if (row === undefined || chaos.deleted.has(id)) {
			return yield* new DocNotFound({ docId: id });
		}
		return row;
	});

const Handlers = DocRpcs.toLayer({
	GetDoc: (payload) =>
		Effect.gen(function* () {
			yield* latency;
			if (getChaos().serverBug) {
				return yield* Effect.die(
					new Error(`GetDoc(${payload.id}): the row failed to decode`),
				);
			}
			const row = yield* find(payload.id);
			return { id: payload.id, ...row };
		}),
	ListDocs: () =>
		Effect.gen(function* () {
			yield* latency;
			const chaos = getChaos();
			return [...rows]
				.filter(([id]) => !chaos.deleted.has(id))
				.map(([id, row]) => ({
					id,
					locked: chaos.locked.has(id),
					title: row.title,
				}));
		}),
	RenameDoc: (payload) =>
		Effect.gen(function* () {
			yield* latency;
			const row = yield* find(payload.id);
			const title = payload.title.trim();
			if (title === "") {
				return yield* new EmptyTitle();
			}
			const user = yield* CurrentUser;
			row.title = title;
			row.updatedBy = user.name;
			return { id: payload.id, ...row };
		}),
});

const SessionLive = Layer.succeed(Session, (effect) =>
	getChaos().signedIn
		? Effect.provideService(effect, CurrentUser, { name: "You" })
		: Effect.fail(new Unauthorized()),
);

export const ServerLive = Layer.merge(Handlers, SessionLive);
