/** What the type switches are set to. The live app remounts when they change. */
import { useSyncExternalStore } from "react";

import { type Config, defaultConfig } from "./configs.ts";

let state: Config = defaultConfig;

const listeners = new Set<() => void>();

export const getConfig = (): Config => state;

export const setConfig = (patch: Partial<Config>): void => {
	state = { ...state, ...patch };
	for (const listener of listeners) {
		listener();
	}
};

const subscribe = (listener: () => void) => {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
};

export const useConfig = (): Config =>
	useSyncExternalStore(subscribe, getConfig);
