"use client";

import {
	applyStaleTime,
	DEFAULT_LATENCY_MS,
	DEFAULT_STALE_TIME,
	LATENCY_COOKIE,
	latencyOptions,
	parseLatency,
	parseStaleTime,
	STALE_TIME_COOKIE,
	staleTimeOptions,
} from "@examples/db/types";
import { Button } from "@examples/ui/components/button";
import {
	NativeSelect,
	NativeSelectOption,
} from "@examples/ui/components/native-select";
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
		<div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
			<label className="flex items-center gap-2">
				<span className="text-muted-foreground whitespace-nowrap">
					Prefetch links
				</span>
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
				<span className="text-muted-foreground whitespace-nowrap">
					Stale time
				</span>
				<NativeSelect
					onChange={(event) => {
						const next = parseStaleTime(event.target.value);
						if (next === undefined) {
							return;
						}
						writeCookie(STALE_TIME_COOKIE, event.target.value);
						applyStaleTime(defaults, next);
						setStaleTime(next);
					}}
					size="sm"
					value={staleTime ?? DEFAULT_STALE_TIME}
				>
					{staleTimeOptions.map((option) => (
						<NativeSelectOption key={option.label} value={option.ms}>
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
				onClick={() => {
					clearCookie(PREFETCH_COOKIE);
					clearCookie(LATENCY_COOKIE);
					clearCookie(STALE_TIME_COOKIE);
					applyStaleTime(defaults, DEFAULT_STALE_TIME);
					queryClient.clear();
					window.location.reload();
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
