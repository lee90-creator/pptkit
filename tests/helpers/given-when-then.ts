export interface StepContext {
	[key: string]: unknown;
}

export function given(description: string, fn: (ctx: StepContext) => void | Promise<void>): void {
	const label = `Given ${description}`;
	void label;
	void fn;
}

export function when(description: string, fn: (ctx: StepContext) => void | Promise<void>): void {
	const label = `When ${description}`;
	void label;
	void fn;
}

export function then(description: string, fn: (ctx: StepContext) => void | Promise<void>): void {
	const label = `Then ${description}`;
	void label;
	void fn;
}

export function createContext(initial: Record<string, unknown> = {}): StepContext {
	return { ...initial };
}
