"use client";

import {
	DEFAULT_LATENCY_MS,
	LATENCY_COOKIE,
	latencyOptions,
	parseLatency,
} from "@examples/db/types";
import { Button } from "@examples/ui/components/button";
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
	clearCookie,
	DEFAULT_PREFETCH,
	parsePrefetch,
	type Prefetch,
	PREFETCH_COOKIE,
	prefetchOptions,
	writeCookie,
} from "~/settings.ts";

const PrefetchContext = createContext<{
	readonly prefetch: Prefetch;
	readonly setPrefetch: (prefetch: Prefetch) => void;
}>({ prefetch: DEFAULT_PREFETCH, setPrefetch: () => {} });

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
export function Settings(props: { readonly latency: number | undefined }) {
	const settings = use(PrefetchContext);
	const [latency, setLatency] = useState(props.latency);
	const changed =
		latency !== undefined || settings.prefetch !== DEFAULT_PREFETCH;

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
						setLatency(parseLatency(event.target.value));
					}}
					size="sm"
					value={latency ?? DEFAULT_LATENCY_MS}
				>
					{latencyOptions.map((option) => (
						<NativeSelectOption key={option.ms} value={option.ms}>
							{option.label}
						</NativeSelectOption>
					))}
				</NativeSelect>
			</label>
			<Button
				disabled={!changed}
				onClick={() => {
					clearCookie(PREFETCH_COOKIE);
					clearCookie(LATENCY_COOKIE);
					setLatency(undefined);
					settings.setPrefetch(DEFAULT_PREFETCH);
				}}
				size="sm"
				variant="ghost"
			>
				Reset
			</Button>
		</div>
	);
}

/**
 * `next/link`, prefetching as the settings say. Off passes `prefetch={false}`,
 * in the viewport passes `true`, and "On intent" passes `true` once the
 * pointer or focus reaches the link. Next.js only prefetches in production
 * builds.
 */
export function AppLink(props: ComponentProps<typeof Link>) {
	const settings = use(PrefetchContext);
	const [intent, setIntent] = useState(false);

	if (settings.prefetch !== "intent") {
		return <Link {...props} prefetch={settings.prefetch === "viewport"} />;
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
