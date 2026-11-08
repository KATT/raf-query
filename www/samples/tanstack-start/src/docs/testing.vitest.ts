// The parts of Vitest's API the testing page's blocks use. The blocks don't
// show their imports, and this app doesn't install Vitest.

export declare function test(
	name: string,
	run: () => Promise<void> | void,
): void;

export declare function beforeEach(run: () => Promise<void> | void): void;

export declare function afterEach(run: () => Promise<void> | void): void;

export declare function expect(actual: unknown): {
	toBe(expected: unknown): void;
	toBeDefined(): void;
	toBeUndefined(): void;
};
