export type ExecutableLocator = (name: string) => string | null;

export function canRunWslWindowsTests(locator: ExecutableLocator = Bun.which): boolean {
	return locator("wslpath") !== null && locator("powershell.exe") !== null;
}

export function canRunProviderMatrix(installFixtureExists: boolean, locator: ExecutableLocator = Bun.which): boolean {
	return installFixtureExists && canRunWslWindowsTests(locator);
}
