import { describe, expect, test } from "bun:test";

import { canRunProviderMatrix, canRunWslWindowsTests } from "./windows-environment.js";

function locator(...available: readonly string[]): (name: string) => string | null {
	return (name) => (available.includes(name) ? `/bin/${name}` : null);
}

describe("Windows integration test gates", () => {
	test("requires both the WSL path bridge and Windows PowerShell", () => {
		expect(canRunWslWindowsTests(locator("wslpath", "powershell.exe"))).toBe(true);
		expect(canRunWslWindowsTests(locator("wslpath"))).toBe(false);
		expect(canRunWslWindowsTests(locator("powershell.exe"))).toBe(false);
	});

	test("requires a checked-in or locally prepared provider fixture", () => {
		expect(canRunProviderMatrix(true, locator("wslpath", "powershell.exe"))).toBe(true);
		expect(canRunProviderMatrix(false, locator("wslpath", "powershell.exe"))).toBe(false);
	});
});
