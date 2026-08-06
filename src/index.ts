#!/usr/bin/env node
export { buildProgram } from "./cli/args.js";
export { main, runCli } from "./cli/main.js";

import { main } from "./cli/main.js";

if (import.meta.main) {
	main(process.argv.slice(2)).then((exitCode) => {
		process.stdout.write("", () => {
			process.stderr.write("", () => process.exit(exitCode));
		});
	});
}
