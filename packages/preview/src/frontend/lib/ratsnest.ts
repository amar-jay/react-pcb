import type { BoardIr, IrPart } from "@react-pcb/core";

export type Airwire = {
	net: string;
	x1: number;
	y1: number;
	x2: number;
	y2: number;
};

type Node = { x: number; y: number };

const toMillimetres = { mm: 1, mil: 0.0254, in: 25.4 } as const;

/** Straight airwires for pads that share a net. There is no routed copper to subtract. */
export function ratsnest(ir: BoardIr): Airwire[] {
	const byNet = new Map<string, Node[]>();
	for (const part of ir.parts) {
		for (const [pin, net] of Object.entries(part.connections)) {
			const pads = part.pinMap[pin]?.length ? part.pinMap[pin] : [pin];
			const nodes = byNet.get(net) ?? [];
			for (const pad of pads) {
				const point = padPoint(ir, part, pad);
				if (point) nodes.push(point);
			}
			byNet.set(net, nodes);
		}
	}
	return [...byNet.entries()].flatMap(([net, nodes]) =>
		spanningTree(dedupe(nodes)).map(([a, b]) => ({
			net,
			x1: a.x,
			y1: a.y,
			x2: b.x,
			y2: b.y,
		})),
	);
}

function padPoint(ir: BoardIr, part: IrPart, padId: string): Node | null {
	const feature = part.physicalFeatures[padId];
	if (
		feature &&
		(feature.geometry.purpose === "pad" ||
			feature.geometry.purpose === "plated-hole")
	) {
		return {
			x: feature.geometry.at[0] / 1_000_000,
			y: feature.geometry.at[1] / 1_000_000,
		};
	}
	const pad = ir.footprintDefinitions[part.footprint]?.pads.find(
		(item) => item.id === padId,
	);
	if (!pad || !part.at) return null;
	const scale = toMillimetres[ir.units];
	let x = pad.at[0];
	let y = pad.at[1];
	if (part.side === "back") x = -x;
	const quarter = [0, 90, 180, 270].indexOf(part.rotation);
	if (quarter >= 0) {
		[x, y] =
			quarter === 0
				? [x, y]
				: quarter === 1
					? [-y, x]
					: quarter === 2
						? [-x, -y]
						: [y, -x];
	} else {
		const radians = (part.rotation * Math.PI) / 180;
		const cos = Math.cos(radians);
		const sin = Math.sin(radians);
		const rotatedX = cos * x - sin * y;
		y = sin * x + cos * y;
		x = rotatedX;
	}
	return {
		x: (part.at[0] + x) * scale,
		y: (part.at[1] + y) * scale,
	};
}

function dedupe(nodes: Node[]) {
	const seen = new Set<string>();
	return nodes.filter((node) => {
		const key = `${node.x.toFixed(6)},${node.y.toFixed(6)}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

/** Kruskal minimum spanning tree. Zero-length pairs are already removed. */
function spanningTree(nodes: Node[]): [Node, Node][] {
	const edges: { i: number; j: number; length: number }[] = [];
	for (let i = 0; i < nodes.length; i++) {
		for (let j = i + 1; j < nodes.length; j++) {
			const a = nodes[i];
			const b = nodes[j];
			if (!a || !b) continue;
			edges.push({
				i,
				j,
				length: (a.x - b.x) ** 2 + (a.y - b.y) ** 2,
			});
		}
	}
	edges.sort((left, right) => left.length - right.length);
	const parent = nodes.map((_, index) => index);
	const find = (index: number): number => {
		const root = parent[index];
		if (root === undefined || root === index) return index;
		const found = find(root);
		parent[index] = found;
		return found;
	};
	const lines: [Node, Node][] = [];
	for (const edge of edges) {
		const left = find(edge.i);
		const right = find(edge.j);
		if (left === right) continue;
		parent[left] = right;
		const a = nodes[edge.i];
		const b = nodes[edge.j];
		if (a && b) lines.push([a, b]);
		if (lines.length === nodes.length - 1) break;
	}
	return lines;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** Draw airwires in board millimetres. The group is recreated when the SVG markup is replaced. */
export function renderRatsnest(
	svg: SVGSVGElement,
	ir: BoardIr,
	options: { visible: boolean; color: string; net: string },
) {
	let group = svg.querySelector<SVGGElement>('g[data-overlay="ratsnest"]');
	if (!group) {
		group = document.createElementNS(SVG_NS, "g");
		group.setAttribute("data-overlay", "ratsnest");
		svg.appendChild(group);
	}
	group.replaceChildren();
	group.style.display = options.visible ? "" : "none";
	group.style.pointerEvents = "none";
	group.style.fill = "none";
	group.style.stroke = options.color;
	for (const wire of ratsnest(ir)) {
		const line = document.createElementNS(SVG_NS, "line");
		line.setAttribute("x1", String(wire.x1));
		line.setAttribute("y1", String(wire.y1));
		line.setAttribute("x2", String(wire.x2));
		line.setAttribute("y2", String(wire.y2));
		line.setAttribute("data-net-id", wire.net);
		line.style.vectorEffect = "non-scaling-stroke";
		line.style.strokeWidth = "1px";
		line.style.strokeDasharray = "4px 3px";
		const active = options.net === wire.net;
		line.classList.toggle("net-match", active);
		line.classList.toggle("dimmed", !!options.net && !active);
		group.appendChild(line);
	}
}
