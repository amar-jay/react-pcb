import { compile, PcbCompileError } from "@react-pcb/core";
import Esc from "./board.tsx";

export default Esc;

if (import.meta.main)
	try {
		const result = await compile(<Esc />, { cwd: `${import.meta.dir}/../..` });
		console.log(JSON.stringify(result, null, 2));
	} catch (error) {
		if (error instanceof PcbCompileError) {
			console.log(error.message);
			process.exit(1);
		}
		throw error;
	}
