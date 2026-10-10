import { assertName } from "../validation/index.ts";
import type { Net, Part, Pin } from "./types.ts";

export function net(name: string, id = name): Net {
	assertName(name, "net name", true);
	assertName(id, "net id", true);
	return Object.freeze({ kind: "net", id, name });
}

export function part(reference: string, id = reference): Part {
	assertName(reference, "part reference");
	assertName(id, "part id", true);
	return Object.freeze({ kind: "part", id, reference });
}

export function pad(owner: Part, name: string): Pin {
	assertName(name, "pin name", true);
	return Object.freeze({ kind: "pin", part: owner, name });
}
