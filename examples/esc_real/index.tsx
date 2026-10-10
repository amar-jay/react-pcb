import { compile } from "@react-pcb/core";
import EscReal from "./board.tsx";

export default EscReal;

if (import.meta.main) {
	const result = await compile(<EscReal />, {
		cwd: `${import.meta.dir}/../..`,
		hideWarnings: true,
	});
	console.log(JSON.stringify(result, null, 2));
}
