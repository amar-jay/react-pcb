export function assertFinite(value: number, label: string) {
	if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
}

export function assertPositive(value: number, label: string) {
	if (!Number.isFinite(value) || value <= 0)
		throw new Error(`${label} must be positive`);
}

export function assertNonNegative(value: number, label: string) {
	if (!Number.isFinite(value) || value < 0)
		throw new Error(`${label} must not be negative`);
}

export function assertName(value: string, label: string, allowPath = false) {
	if (value.trim().length === 0 || (!allowPath && value.includes("/"))) {
		const suffix = allowPath ? "" : ' without "/"';
		throw new Error(`${label} must be a non-empty name${suffix}`);
	}
}
