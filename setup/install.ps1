$CliArguments = @($args | Where-Object { $_ -ne "--install-only" })
$InstallOnly = $args -contains "--install-only"

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.UTF8Encoding]::new()

$distributionRoot = if ($env:KCH_DISTRIBUTION_ROOT) {
	[IO.Path]::GetFullPath($env:KCH_DISTRIBUTION_ROOT)
} else {
	[IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
}
$installRoot = if ($env:KCH_INSTALL_ROOT) {
	[IO.Path]::GetFullPath($env:KCH_INSTALL_ROOT)
} else {
	Join-Path $env:LOCALAPPDATA "KCH\PptAutomation"
}
$claudeSkillsRoot = if ($env:KCH_CLAUDE_SKILLS_ROOT) {
	$env:KCH_CLAUDE_SKILLS_ROOT
} else {
	Join-Path $HOME ".claude\skills"
}
$codexSkillsRoot = if ($env:KCH_CODEX_SKILLS_ROOT) {
	$env:KCH_CODEX_SKILLS_ROOT
} else {
	Join-Path $HOME ".agents\skills"
}
$manifestPath = Join-Path $distributionRoot "dist\manifest.json"

function Write-InstallStep {
	param(
		[string]$Id,
		[string]$State,
		[string]$Message,
		[string]$Path = "",
		[string]$Sha256 = ""
	)
	$value = [ordered]@{ id = $Id; state = $State; message = $Message }
	if ($State -eq "BLOCKED") {
		$value.path = $Path
		$value.sha256 = $Sha256
	}
	[Console]::Out.WriteLine(($value | ConvertTo-Json -Compress))
}

function Get-FileSha256 {
	param([string]$Path)
	return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Test-DirectoryEqual {
	param([string]$Source, [string]$Target)
	if (-not (Test-Path -LiteralPath $Target -PathType Container)) { return $false }
	$sourceFiles = @(Get-ChildItem -LiteralPath $Source -File -Recurse)
	$targetFiles = @(Get-ChildItem -LiteralPath $Target -File -Recurse)
	if ($sourceFiles.Count -ne $targetFiles.Count) { return $false }
	foreach ($sourceFile in $sourceFiles) {
		$relative = $sourceFile.FullName.Substring($Source.Length).TrimStart("\")
		$targetFile = Join-Path $Target $relative
		if (-not (Test-Path -LiteralPath $targetFile -PathType Leaf) -or
			(Get-FileSha256 $sourceFile.FullName) -ne (Get-FileSha256 $targetFile)) {
			return $false
		}
	}
	return $true
}

function Install-ManagedFile {
	param([string]$Source, [string]$Target)
	if ((Test-Path -LiteralPath $Target -PathType Leaf) -and
		(Get-FileSha256 $Source) -eq (Get-FileSha256 $Target)) {
		return "SKIP"
	}
	New-Item -ItemType Directory -Path (Split-Path -Parent $Target) -Force | Out-Null
	Copy-Item -LiteralPath $Source -Destination $Target -Force
	return "INSTALL"
}

function Install-ManagedDirectory {
	param([string]$Source, [string]$Target)
	if (Test-DirectoryEqual -Source $Source -Target $Target) { return "SKIP" }
	if (Test-Path -LiteralPath $Target) { Remove-Item -LiteralPath $Target -Recurse -Force }
	New-Item -ItemType Directory -Path (Split-Path -Parent $Target) -Force | Out-Null
	Copy-Item -LiteralPath $Source -Destination $Target -Recurse -Force
	return "INSTALL"
}

function Register-PretendardFonts {
	param([string]$Source)
	if ($env:KCH_SKIP_FONT_REGISTRATION -eq "1" -or -not (Test-Path -LiteralPath $Source -PathType Container)) { return }
	$fontRoot = Join-Path $env:LOCALAPPDATA "Microsoft\Windows\Fonts"
	New-Item -ItemType Directory -Path $fontRoot -Force | Out-Null
	$registry = "HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Fonts"
	foreach ($font in Get-ChildItem -LiteralPath $Source -Filter "Pretendard-*.ttf" -File) {
		$target = Join-Path $fontRoot $font.Name
		if (-not (Test-Path -LiteralPath $target)) { Copy-Item -LiteralPath $font.FullName -Destination $target }
		New-ItemProperty -Path $registry -Name ($font.BaseName + " (TrueType)") -Value $target -PropertyType String -Force |
			Out-Null
	}
}

function Resolve-Node {
	if ($env:KCH_NODE_PATH) {
		if (Test-Path -LiteralPath $env:KCH_NODE_PATH -PathType Leaf) { return $env:KCH_NODE_PATH }
		return $null
	}
	$command = Get-Command node.exe -ErrorAction SilentlyContinue
	if ($null -eq $command) { $command = Get-Command node -ErrorAction SilentlyContinue }
	if ($null -eq $command) { return $null }
	return $command.Source
}

try {
	$node = Resolve-Node
	if ($null -eq $node) {
		Write-InstallStep -Id "node" -State "BLOCKED" -Message "Node.js 20 이상이 필요합니다." `
			-Path $(if ($env:KCH_NODE_PATH) { $env:KCH_NODE_PATH } else { "PATH:node" }) -Sha256 ("0" * 64)
		exit 21
	}
	$versionText = (& $node --version | Select-Object -First 1)
	if ($versionText -notmatch "^v(\d+)\.") {
		Write-InstallStep -Id "node" -State "BLOCKED" -Message "Node.js 버전을 확인할 수 없습니다." `
			-Path $node -Sha256 (Get-FileSha256 $node)
		exit 21
	}
	if ([int]$Matches[1] -lt 20) {
		Write-InstallStep -Id "node" -State "BLOCKED" -Message "Node.js 20 이상이 필요합니다." `
			-Path $node -Sha256 (Get-FileSha256 $node)
		exit 21
	}
	Write-InstallStep -Id "node" -State "CHECK" -Message ("기존 Node.js " + $versionText + "을 사용합니다.")

	if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw "경량 배포 manifest가 없습니다." }
	$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
	if ($manifest.schemaVersion -ne 2 -or $manifest.profile -ne "lightweight") {
		throw "경량 배포 manifest 계약이 올바르지 않습니다."
	}
	foreach ($file in $manifest.files) {
		$source = [IO.Path]::GetFullPath((Join-Path $distributionRoot ([string]$file.path)))
		if (-not $source.StartsWith($distributionRoot + [IO.Path]::DirectorySeparatorChar)) {
			throw "배포 파일 경로가 루트를 벗어납니다."
		}
		if (-not (Test-Path -LiteralPath $source -PathType Leaf) -or
			(Get-FileSha256 $source) -ne ([string]$file.sha256).ToLowerInvariant()) {
			throw "배포 파일 SHA-256이 일치하지 않습니다: $source"
		}
	}
	Write-InstallStep -Id "manifest" -State "CHECK" -Message "경량 배포 파일과 SHA-256을 확인했습니다."

	$state = Install-ManagedFile -Source (Join-Path $distributionRoot "dist\app\kch-ppt.cjs") `
		-Target (Join-Path $installRoot "app\kch-ppt.cjs")
	Write-InstallStep -Id "application" -State $state -Message "KCHPPT CLI를 준비했습니다."
	$state = Install-ManagedDirectory -Source (Join-Path $distributionRoot "assets") -Target (Join-Path $installRoot "assets")
	Register-PretendardFonts -Source (Join-Path $distributionRoot "assets\fonts")
	Write-InstallStep -Id "assets" -State $state -Message "KCH 자산과 글꼴을 준비했습니다."
	$state = Install-ManagedDirectory -Source (Join-Path $distributionRoot "dist\office-qa") `
		-Target (Join-Path $installRoot "office-qa")
	Write-InstallStep -Id "office-qa" -State $state -Message "선택적 PowerPoint QA를 준비했습니다."
	$state = Install-ManagedDirectory -Source (Join-Path $distributionRoot "plugins\claude-code\skills\kchppt") `
		-Target (Join-Path $claudeSkillsRoot "kchppt")
	Write-InstallStep -Id "claude-kchppt" -State $state -Message "Claude Code 스킬을 준비했습니다."
	$state = Install-ManagedDirectory -Source (Join-Path $distributionRoot "plugins\codex\skills\kchppt") `
		-Target (Join-Path $codexSkillsRoot "kchppt")
	Write-InstallStep -Id "codex-kchppt" -State $state -Message "Codex 스킬을 준비했습니다."

	$launcherPath = Join-Path $installRoot "bin\kch-ppt.cmd"
	$launcher = "@echo off`r`n`"$node`" `"%~dp0..\app\kch-ppt.cjs`" %*`r`n"
	$launcherState = if ((Test-Path -LiteralPath $launcherPath -PathType Leaf) -and
		(Get-Content -LiteralPath $launcherPath -Raw -Encoding UTF8) -eq $launcher) {
		"SKIP"
	} else {
		New-Item -ItemType Directory -Path (Split-Path -Parent $launcherPath) -Force | Out-Null
		Set-Content -LiteralPath $launcherPath -Value $launcher -Encoding ASCII -NoNewline
		"INSTALL"
	}
	Write-InstallStep -Id "launcher" -State $launcherState -Message "kch-ppt 실행 명령을 준비했습니다."

	if (-not $InstallOnly -and $CliArguments.Count -gt 0) {
		& $node (Join-Path $installRoot "app\kch-ppt.cjs") @CliArguments
		exit $LASTEXITCODE
	}
	exit 0
}
catch {
	Write-InstallStep -Id "installer" -State "BLOCKED" -Message $_.Exception.Message `
		-Path $manifestPath -Sha256 ("0" * 64)
	exit 22
}
