"use client";

import {
	applyStaleTime,
	DEFAULT_LATENCY_MS,
	DEFAULT_STALE_TIME,
	LATENCY_COOKIE,
	parseLatency,
	parseStaleTime,
	STALE_TIME_COOKIE,
} from "@examples/db/types";
import { SettingsControls } from "@examples/kit/components/settings";
import { useQueryClient } from "@raf-query/react";
import Link from "next/link";
import {
	type ComponentProps,
	createContext,
	type ReactNode,
	use,
	useState,
} from "react";

import { useStaleTimeDefaults } from "~/components/app-query-provider.tsx";
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
export function Settings(props: {
	readonly latency: number | undefined;
	readonly staleTime: number | undefined;
}) {
	const settings = use(PrefetchContext);
	const queryClient = useQueryClient();
	const defaults = useStaleTimeDefaults();
	const [latency, setLatency] = useState(props.latency);
	const [staleTime, setStaleTime] = useState(props.staleTime);

	return (
		<SettingsControls
			latency={latency ?? DEFAULT_LATENCY_MS}
			onLatencyChange={(value) => {
				writeCookie(LATENCY_COOKIE, value);
				setLatency(parseLatency(value));
			}}
			onPrefetchChange={(value) => {
				const next = parsePrefetch(value);
				writeCookie(PREFETCH_COOKIE, next);
				settings.setPrefetch(next);
			}}
			onReset={() => {
				clearCookie(PREFETCH_COOKIE);
				clearCookie(LATENCY_COOKIE);
				clearCookie(STALE_TIME_COOKIE);
				applyStaleTime(defaults, DEFAULT_STALE_TIME);
				queryClient.clear();
				window.location.reload();
			}}
			onStaleTimeChange={(value) => {
				const next = parseStaleTime(value);
				if (next === undefined) {
					return;
				}
				writeCookie(STALE_TIME_COOKIE, value);
				applyStaleTime(defaults, next);
				setStaleTime(next);
			}}
			prefetch={settings.prefetch}
			prefetchOptions={prefetchOptions}
			staleTime={staleTime ?? DEFAULT_STALE_TIME}
		/>
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
