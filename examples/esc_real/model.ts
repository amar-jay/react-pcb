import type {
	ElectricalType,
	IrComponentDefinition,
	Net,
} from "@react-pcb/core";
import { net } from "@react-pcb/core";

export type Device = {
	key: string;
	definition: IrComponentDefinition;
	pinMap: Record<string, string>;
};
export type CircuitPart = {
	id: string;
	reference: string;
	section: string;
	device: Device;
	connections: Record<string, Net>;
	noConnect: Record<string, string>;
	populate: boolean;
	role: string;
};
export type ReviewItem = {
	id: string;
	status: "required" | "verify";
	detail: string;
};

/** Source-side builder only. The compiler emits canonical PCB IR. */
export class Circuit {
	parts: CircuitPart[] = [];
	nets = new Map<string, Net>();
	review: ReviewItem[] = [];
	constructor(public prefix = "esc-real") {}
	n(name: string): Net {
		let found = this.nets.get(name);
		if (!found) {
			found = net(name, `${this.prefix}/net/${name}`);
			this.nets.set(name, found);
		}
		return found;
	}
	add(
		section: string,
		reference: string,
		device: Device,
		connections: Record<string, string>,
		role: string,
		options: { noConnect?: Record<string, string>; populate?: boolean } = {},
	): CircuitPart {
		const id = `${this.prefix}/${section}/${reference}`;
		if (this.parts.some((p) => p.id === id || p.reference === reference))
			throw new Error(`Duplicate part identity/reference: ${id}`);
		const noConnect = options.noConnect ?? {};
		for (const name of [
			...Object.keys(connections),
			...Object.keys(noConnect),
		]) {
			if (!device.definition.pins?.[name])
				throw new Error(`${reference}: unknown ${device.key} pin ${name}`);
			if (name in connections && name in noConnect)
				throw new Error(
					`${reference}.${name}: connected and marked no-connect`,
				);
		}
		for (const name of Object.keys(device.definition.pins ?? {})) {
			if (!(name in connections) && !(name in noConnect))
				throw new Error(
					`${reference}.${name}: pin needs connection or no-connect reason`,
				);
		}
		const p = {
			id,
			reference,
			section,
			device,
			role,
			noConnect,
			populate: options.populate ?? true,
			connections: Object.fromEntries(
				Object.entries(connections).map(([pin, name]) => [pin, this.n(name)]),
			),
		};
		this.parts.push(p);
		return p;
	}
}

export function device(
	key: string,
	manufacturer: string | undefined,
	mpn: string | undefined,
	packageName: string,
	url: string | undefined,
	pins: Record<string, [string, ElectricalType]>,
	value?: string,
): Device {
	return {
		key,
		pinMap: Object.fromEntries(
			Object.entries(pins).map(([name, [pad]]) => [name, pad]),
		),
		definition: {
			...(manufacturer ? { manufacturer } : {}),
			...(mpn ? { mpn } : {}),
			...(value ? { value } : {}),
			package: packageName,
			...(url ? { datasheet: { url, document: mpn ?? key } } : {}),
			pinoutCoverage: "complete",
			pins: Object.fromEntries(
				Object.entries(pins).map(([name, [, electricalType]]) => [
					name,
					{ electricalType },
				]),
			),
		},
	};
}
