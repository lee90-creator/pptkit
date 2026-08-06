# KCHPPT 원격 설치 (Windows)
#   irm https://raw.githubusercontent.com/lee90-creator/pptkit/main/setup/install-remote.ps1 | iex
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.UTF8Encoding]::new()

$assetUrl = if ($env:KCH_ASSET_URL) {
	$env:KCH_ASSET_URL
} else {
	"https://github.com/lee90-creator/pptkit/releases/latest/download/kch-ppt-lightweight.zip"
}
$work = Join-Path ([IO.Path]::GetTempPath()) ("kchppt-" + [Guid]::NewGuid().ToString("n"))

function Write-Step {
	param([string]$Id, [string]$State, [string]$Message)
	[Console]::Out.WriteLine(([ordered]@{ id = $Id; state = $State; message = $Message } | ConvertTo-Json -Compress))
}

try {
	New-Item -ItemType Directory -Path $work -Force | Out-Null
	$archive = Join-Path $work "kchppt.zip"
	[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
	Invoke-WebRequest -Uri $assetUrl -OutFile $archive -UseBasicParsing
	Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $work "src") -Force
	$installer = Join-Path $work "src\setup\install.ps1"
	if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) { throw "배포 파일에 설치 스크립트가 없습니다." }
	& $installer --install-only
	exit $LASTEXITCODE
}
catch {
	Write-Step -Id "remote" -State "BLOCKED" -Message $_.Exception.Message
	exit 23
}
finally {
	Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
}
