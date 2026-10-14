"use client";

import { LATENCY_COOKIE, latencyOptions } from "@examples/db/types";
import {
	NativeSelect,
	NativeSelectOption,
} from "@examples/ui/components/native-select";
import Link from "next/link";
import {
	type ComponentProps,
	createContext,
	type ReactNode,
	use,
	useState,
} from "react";

import {
	parsePrefetch,
	type Prefetch,
	PREFETCH_COOKIE,
	prefetchOptions,
	writeCookie,
} from "~/settings.ts";

const PrefetchContext = createContext<{
	readonly prefetch: Prefetch;
	readonly setPrefetch: (prefetch: Prefetch) => void;
}>({ prefetch: "auto", setPrefetch: () => {} });

/** Holds the prefetch setting, starting from the value in its cookie. */
export function SettingsProvider(props: {
	readonly children: ReactNode;
	readonly prefetch: Prefetch;
}) {
	const [prefetch, setPrefetch] = useState(props.prefetch);
	return (
		<PrefetchContext value={{ prefetch, setPrefetch }}>
			{props.children}
		</PrefetchContext>
	);
}

/** Settings for trying the app under different conditions. */
export function Settings(props: { readonly latency: number }) {
	const settings = use(PrefetchContext);
	const [latency, setLatency] = useState(props.latency);

	return (
		<div className="flex items-center gap-4 text-sm">
			<label className="flex items-center gap-2">
				<span className="text-muted-foreground">Prefetch links</span>
				<NativeSelect
					onChange={(event) => {
						const next = parsePrefetch(event.target.value);
						writeCookie(PREFETCH_COOKIE, next);
						settings.setPrefetch(next);
					}}
					size="sm"
					value={settings.prefetch}
				>
					{prefetchOptions.map((option) => (
						<NativeSelectOption key={option.value} value={option.value}>
							{option.label}
						</NativeSelectOption>
					))}
				</NativeSelect>
			</label>
			<label className="flex items-center gap-2">
				<span className="text-muted-foreground">Latency</span>
				<NativeSelect
					onChange={(event) => {
						writeCookie(LATENCY_COOKIE, event.target.value);
						setLatency(Number(event.target.value));
					}}
					size="sm"
					value={latency}
				>
					{latencyOptions.map((option) => (
						<NativeSelectOption key={option.ms} value={option.ms}>
							{option.label}
						</NativeSelectOption>
					))}
				</NativeSelect>
			</label>
		</div>
	);
}

/**
 * `next/link`, prefetching as the settings say. "On intent" prefetches the
 * full route once the pointer or focus reaches the link. Next.js only
 * prefetches in production builds.
 */
export function AppLink(props: ComponentProps<typeof Link>) {
	const { prefetch } = use(PrefetchContext);
	const [intent, setIntent] = useState(false);

	if (prefetch !== "intent") {
		return (
			<Link
				{...props}
				prefetch={prefetch === "auto" ? null : prefetch === "viewport"}
			/>
		);
	}
	const showIntent = () => {
		setIntent(true);
	};
	return (
		<Link
			{...props}
			onFocus={showIntent}
			onMouseEnter={showIntent}
			onTouchStart={showIntent}
			prefetch={intent}
		/>
	);
}
