import { describe, expect, test } from "bun:test";

import { NodeProcessRunner, prepareProcessCommand } from "../../src/providers/process.js";

describe("cross-platform provider process command", () => {
	test("routes Windows cmd shims through ComSpec with quoted arguments", () => {
		expect(
			prepareProcessCommand(
				{
					command: "C:\\Program Files\\KCH\\codex.cmd",
					args: ["exec", "--output-schema", "C:\\Temp Folder\\schema.json", "-"],
				},
				"win32",
				"C:\\Windows\\System32\\cmd.exe",
			),
		).toEqual({
			command: "C:\\Windows\\System32\\cmd.exe",
			args: [
				"/d",
				"/s",
				"/c",
				'"C:\\Program^ Files\\KCH\\codex.cmd ^^^"exec^^^" ^^^"--output-schema^^^" ^^^"C:\\Temp^^^ Folder\\schema.json^^^" ^^^"-^^^""',
			],
			windowsVerbatimArguments: true,
		});
	});

	test("escapes quotes and cmd metacharacters in structured arguments", () => {
		expect(
			prepareProcessCommand(
				{
					command: "C:\\Program Files\\KCH\\claude.cmd",
					args: ["--json-schema", '{"type":"object","value":"x&y%z!"}'],
				},
				"win32",
				"cmd.exe",
			).args[3],
		).toBe(
			'"C:\\Program^ Files\\KCH\\claude.cmd ^^^"--json-schema^^^" ^^^"{\\^^^"type\\^^^":\\^^^"object\\^^^"^^^,\\^^^"value\\^^^":\\^^^"x^^^&y^^^%z^^^!\\^^^"}^^^""',
		);
	});

	test("rejects line-breaking cmd arguments before spawning", () => {
		expect(() => prepareProcessCommand({ command: "C:\\KCH\\claude.cmd", args: ["safe\r\nwhoami"] }, "win32")).toThrow(
			"Windows cmd arguments cannot contain NUL or line breaks",
		);
	});

	test("rejects a missing executable without an unhandled stdin error", async () => {
		const runner = new NodeProcessRunner();
		try {
			await runner.run({
				command: `kch-missing-${crypto.randomUUID()}`,
				args: [],
				stdin: "prompt",
				timeoutMs: 1_000,
			});
			throw new Error("expected the missing executable to reject");
		} catch (error) {
			expect(error).toBeDefined();
		}
	});

	test("keeps native executables unchanged", () => {
		expect(prepareProcessCommand({ command: "/usr/bin/codex", args: ["login", "status"] }, "linux")).toEqual({
			command: "/usr/bin/codex",
			args: ["login", "status"],
			windowsVerbatimArguments: false,
		});
	});
});
