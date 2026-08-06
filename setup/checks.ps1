Set-StrictMode -Version Latest

$script:StepIds = @(
	"distribution-manifest",
	"runtime-node",
	"application",
	"fonts-pretendard",
	"claude-cli",
	"codex-cli",
	"claude-kchppt",
	"codex-kchppt",
	"provider-auth",
	"office-qa"
)

function Write-BootstrapStep {
	param(
		[string]$Id,
		[string]$State,
		[string]$Message,
		[string]$SupportTier = "A",
		[string]$Path = "",
		[string]$Sha256 = "",
		[string]$ItAction = ""
	)
	$value = [ordered]@{ id = $Id; state = $State; supportTier = $SupportTier; message = $Message }
	if ($State -eq "BLOCKED") {
		$value.path = $Path
		$value.sha256 = $Sha256.ToLowerInvariant()
		$value.itAction = $ItAction
	}
	[Console]::Out.WriteLine(($value | ConvertTo-Json -Compress))
}

function Get-FileSha256 {
	param([string]$Path)
	return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Test-InstallReceipt {
	param([object]$Marker, [string]$InstallRoot)
	if ($null -eq $Marker.files) {
		return [ordered]@{ valid = $false; path = $InstallRoot; sha256 = ("0" * 64) }
	}
	foreach ($file in $Marker.files) {
		$path = Join-Path $InstallRoot ([string]$file.path)
		if (-not (Test-Path -LiteralPath $path -PathType Leaf) -or
			(Get-FileSha256 $path) -ne ([string]$file.sha256).ToLowerInvariant()) {
			return [ordered]@{ valid = $false; path = $path; sha256 = [string]$file.sha256 }
		}
	}
	return [ordered]@{ valid = $true; path = ""; sha256 = ("0" * 64) }
}

function New-InstallReceipt {
	param([string]$InstallRoot)
	$files = foreach ($file in Get-ChildItem -LiteralPath $InstallRoot -File -Recurse) {
		if ($file.Name -ne ".bootstrap-state.json") {
			[ordered]@{
				path = $file.FullName.Substring($InstallRoot.Length).TrimStart("\") -replace "\\", "/"
				sha256 = Get-FileSha256 $file.FullName
			}
		}
	}
	return @($files)
}

function Test-DistributionReceipt {
	param([object]$Manifest, [string]$DistributionRoot)
	foreach ($file in $Manifest.files) {
		$path = Join-Path $DistributionRoot ([string]$file.path)
		if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
			return [ordered]@{ valid = $false; path = $path; sha256 = [string]$file.sha256 }
		}
		if ((Get-FileSha256 $path) -ne ([string]$file.sha256).ToLowerInvariant()) {
			return [ordered]@{ valid = $false; path = $path; sha256 = [string]$file.sha256 }
		}
	}
	return [ordered]@{ valid = $true; path = ""; sha256 = ("0" * 64) }
}

function Install-FileOrDirectory {
	param([string]$Source, [string]$Target, [switch]$Refresh)
	if (Test-Path -LiteralPath $Target) {
		if (-not $Refresh) { return "SKIP" }
		Remove-Item -LiteralPath $Target -Recurse -Force
	}
	$parent = Split-Path -Parent $Target
	New-Item -ItemType Directory -Path $parent -Force | Out-Null
	Copy-Item -LiteralPath $Source -Destination $Target -Recurse -Force
	return "INSTALL"
}

function Install-ManagedPlugin {
	param([string]$Source, [string]$SkillsRoot)
	$target = Join-Path $SkillsRoot "kchppt"
	if (Test-Path -LiteralPath $target -PathType Container) {
		$sourceFiles = @(Get-ChildItem -LiteralPath $Source -File -Recurse)
		$targetFiles = @(Get-ChildItem -LiteralPath $target -File -Recurse)
		$matches = $sourceFiles.Count -eq $targetFiles.Count
		if ($matches) {
			foreach ($sourceFile in $sourceFiles) {
				$relative = $sourceFile.FullName.Substring($Source.Length).TrimStart("\")
				$targetFile = Join-Path $target $relative
				if (-not (Test-Path -LiteralPath $targetFile -PathType Leaf) -or
					(Get-FileSha256 $sourceFile.FullName) -ne (Get-FileSha256 $targetFile)) {
					$matches = $false
					break
				}
			}
		}
		if ($matches) { return "SKIP" }
		Remove-Item -LiteralPath $target -Recurse -Force
	}
	New-Item -ItemType Directory -Path $SkillsRoot -Force | Out-Null
	Copy-Item -LiteralPath $Source -Destination $target -Recurse -Force
	return "INSTALL"
}

function Get-ToolSourceRoot {
	param([string]$DistributionRoot, [string]$RootPackage)
	$relative = $RootPackage -replace "/", "\"
	$marker = "\node_modules\"
	$index = $relative.IndexOf($marker, [StringComparison]::OrdinalIgnoreCase)
	if ($index -ge 0) { $relative = $relative.Substring(0, $index) }
	return Join-Path $DistributionRoot $relative
}

function Register-PretendardFonts {
	param([string]$Source)
	if ($env:KCH_SKIP_FONT_REGISTRATION -eq "1") { return }
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
