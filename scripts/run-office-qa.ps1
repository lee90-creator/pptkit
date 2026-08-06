param(
	[Parameter(Mandatory = $true)]
	[string]$SourcePptx,
	[Parameter(Mandatory = $true)]
	[string]$EvidenceDirectory
)

$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $EvidenceDirectory | Out-Null
$requestPath = Join-Path $EvidenceDirectory "request.json"
$resultPath = Join-Path $EvidenceDirectory "result.json"
$request = [ordered]@{
	sourcePptx = $SourcePptx
	originalSha256 = (Get-FileHash -LiteralPath $SourcePptx -Algorithm SHA256).Hash.ToLowerInvariant()
	renderDirectory = Join-Path $EvidenceDirectory "render"
	pdfPath = Join-Path $EvidenceDirectory "render.pdf"
	roundtripPath = Join-Path $EvidenceDirectory "roundtrip.pptx"
	roundtripRenderDirectory = Join-Path $EvidenceDirectory "roundtrip-render"
}
$request | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $requestPath -Encoding UTF8
& (Join-Path $PSScriptRoot "..\src\office-qa\powerpoint.ps1") -RequestPath $requestPath -ResultPath $resultPath
exit $LASTEXITCODE
