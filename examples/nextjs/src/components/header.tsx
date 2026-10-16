"use client";

import { AppHeader } from "@examples/kit/components/app-header";
import { Logo } from "@examples/kit/components/logo";

import { IssuesLink, useLoaderVerb } from "./loader-verb.tsx";
import { Settings } from "./settings.tsx";

/** The top bar, under the URL's verb. */
export function Header(props: {
	readonly latency: number | undefined;
	readonly staleTime: number | undefined;
}) {
	const verb = useLoaderVerb();
	return (
		<AppHeader
			brand={
				<IssuesLink className="flex shrink-0 items-center gap-2.5 font-semibold">
					<Logo alt="" />
					Issues
				</IssuesLink>
			}
			framework="Next.js"
			settings={
				<Settings
					latency={props.latency}
					staleTime={props.staleTime}
					verb={verb}
				/>
			}
			verb={verb}
		/>
	);
}
