import { Boundary } from "@raf-query/experimental-effect-query";
import { Match } from "effect";
import { Suspense, useState } from "react";
import { createRoot } from "react-dom/client";

import {
	App,
	DocAccess,
	Network,
	Session,
	useDocAccess,
	useSession,
} from "~/boundaries.tsx";
import { client } from "~/client.ts";
import { docList, docQuery, renameDoc } from "~/queries.ts";

declare function report(boundary: string, failure: unknown): void;
declare const element: HTMLElement;

// #region mount
export function Docs(props: { id: number }) {
	return (
		<Suspense fallback={<p>Loading…</p>}>
			<App>
				<Network>
					<Session>
						<DocList />
						<DocAccess key={props.id}>
							<Suspense fallback={<p>Loading…</p>}>
								<DocPage id={props.id} />
							</Suspense>
						</DocAccess>
					</Session>
				</Network>
			</App>
		</Suspense>
	);
}
// #endregion

// #region nothing-left
function DocList() {
	const docs = useSession(docList);
	//    ^?
	return (
		<ul>
			{docs.map((doc) => (
				<li key={doc.id}>{doc.title}</li>
			))}
		</ul>
	);
}
// #endregion

// #region what-is-left
function DocPage(props: { id: number }) {
	const doc = useDocAccess(docQuery(props.id));
	//    ^?
	if (Boundary.isUnhandled(doc)) {
		return Match.valueTags(doc.error, {
			DocNotFound: (missing) => <p>Doc {missing.docId} doesn’t exist.</p>,
		});
	}
	return <h1>{doc.title}</h1>;
}
// #endregion

// #region run
export function Rename(props: { id: number }) {
	const run = Boundary.useRun(DocAccess);
	const [problem, setProblem] = useState<string>();
	const save = async (title: string) => {
		const renamed = await run(renameDoc(props.id, title));
		//    ^?
		setProblem(
			Boundary.isUnhandled(renamed)
				? Match.valueTags(renamed.error, {
						DocNotFound: () => "This doc was deleted meanwhile.",
						EmptyTitle: () => "A title can’t be empty.",
					})
				: undefined,
		);
	};
	return (
		<form action={(form) => save(String(form.get("title")))}>
			<input name="title" />
			{problem && <p role="alert">{problem}</p>}
		</form>
	);
}
// #endregion

// #region on-caught
export const [ReportingApp] = Boundary.root({
	name: "App",
	client,
	fallback: () => <p>Something broke.</p>,
	onCaught: (caught) => {
		report(caught.name, caught.root ? caught.cause : caught.error);
	},
});
// #endregion

// #region caught-by
createRoot(element, {
	onCaughtError: (error) => {
		const caught = Boundary.caughtBy(error);
		if (caught) {
			report(caught.name, caught.root ? caught.cause : caught.error);
		}
	},
});
// #endregion
