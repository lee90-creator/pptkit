import { BootstrapBuildError, buildBootstrapDistribution } from "./build-bootstrap.js";

function argument(args: readonly string[], flag: string): string | undefined {
	const index = args.indexOf(flag);
	return index < 0 ? undefined : args[index + 1];
}

const args = process.argv.slice(2);
const outputDir = argument(args, "--output");
if (outputDir === undefined) {
	throw new BootstrapBuildError("usage: build-dist.ts --output <directory> [--source-root <directory>]");
}

await buildBootstrapDistribution({
	sourceRoot: argument(args, "--source-root") ?? process.cwd(),
	outputDir,
	report: (line) => process.stdout.write(`${line}\n`),
});
