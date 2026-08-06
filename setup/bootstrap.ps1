$CliArguments = @($args)
$BootstrapDiagnose = $CliArguments -contains "--bootstrap-diagnose"
$CliArguments = @($CliArguments | Where-Object { $_ -ne "--bootstrap-diagnose" })

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.UTF8Encoding]::new()
. (Join-Path $PSScriptRoot "checks.ps1")

$distributionRoot = if ($env:KCH_DISTRIBUTION_ROOT) {
	$env:KCH_DISTRIBUTION_ROOT
} else {
	[IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
}
$installRoot = if ($env:KCH_INSTALL_ROOT) {
	$env:KCH_INSTALL_ROOT
} else {
	Join-Path $env:LOCALAPPDATA "KCH\PptAutomation"
}
$manifestPath = Join-Path $distributionRoot "dist\manifest.json"
$markerPath = Join-Path $installRoot ".bootstrap-state.json"
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
$claudePluginSource = Join-Path $distributionRoot "plugins\claude-code\skills\kchppt"
$codexPluginSource = Join-Path $distributionRoot "plugins\codex\skills\kchppt"

if ($env:KCH_SIMULATE_BLOCKED_POLICY) {
	Write-BootstrapStep -Id "policy-stop" -State "BLOCKED" -SupportTier "C" `
		-Message ($env:KCH_SIMULATE_BLOCKED_POLICY + " 정책으로 실행이 차단되었습니다.") `
		-Path $env:KCH_SIMULATE_BLOCKED_PATH -Sha256 $env:KCH_SIMULATE_BLOCKED_SHA256 `
		-ItAction ("IT 담당자에게 " + $env:KCH_SIMULATE_BLOCKED_POLICY + " 정책의 경로와 SHA-256 실행 허용을 요청하세요.")
	exit 21
}

try {
	if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
		throw "배포 manifest가 없습니다: $manifestPath"
	}
	$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
	$receipt = Test-DistributionReceipt -Manifest $manifest -DistributionRoot $distributionRoot
	if (-not $receipt.valid) {
		Write-BootstrapStep -Id "distribution-manifest" -State "BLOCKED" -SupportTier "C" `
			-Message "배포 payload가 없거나 SHA-256이 일치하지 않습니다." -Path $receipt.path -Sha256 $receipt.sha256 `
			-ItAction "IT 담당자에게 승인된 오프라인 배포본 재설치를 요청하세요."
		exit 22
	}

	$alreadyInstalled = $false
	$sourceChanged = $false
	if (Test-Path -LiteralPath $markerPath -PathType Leaf) {
		$marker = Get-Content -LiteralPath $markerPath -Raw -Encoding UTF8 | ConvertFrom-Json
		if ($marker.lockSha256 -eq $manifest.lockSha256) {
			$hasSourceReceipt = $marker.PSObject.Properties.Name -contains "sourceSha256"
			if (-not $hasSourceReceipt -or $marker.sourceSha256 -ne $manifest.sourceSha256) {
				$sourceChanged = $true
			} else {
				$installReceipt = Test-InstallReceipt -Marker $marker -InstallRoot $installRoot
				if (-not $installReceipt.valid) {
					Write-BootstrapStep -Id "install-receipt" -State "BLOCKED" -SupportTier "C" `
						-Message "설치된 app-local 파일의 SHA-256이 일치하지 않습니다." `
						-Path $installReceipt.path -Sha256 $installReceipt.sha256 `
						-ItAction "IT 담당자에게 승인된 배포본으로 app-local 설치 복구를 요청하세요."
					exit 24
				}
				$alreadyInstalled = $true
			}
		}
	}
	if ($alreadyInstalled) {
		$claudePluginState = Install-ManagedPlugin -Source $claudePluginSource -SkillsRoot $claudeSkillsRoot
		$codexPluginState = Install-ManagedPlugin -Source $codexPluginSource -SkillsRoot $codexSkillsRoot
		foreach ($id in $script:StepIds) {
			$state = if ($id -eq "claude-kchppt") {
				$claudePluginState
			} elseif ($id -eq "codex-kchppt") {
				$codexPluginState
			} else {
				"SKIP"
			}
			Write-BootstrapStep -Id $id -State $state -Message "검증된 app-local 구성요소와 터미널 플러그인이 준비되어 있습니다."
		}
		if ($BootstrapDiagnose) { exit 0 }
		$runtimeTarget = Join-Path $installRoot ([string]$manifest.runtime.target)
		$appTarget = Join-Path $installRoot ([string]$manifest.application.target)
		$env:PATH = @(
			(Join-Path $installRoot "tools\codex\bin"),
			(Join-Path $installRoot "tools\claude\bin"),
			$runtimeTarget,
			$env:PATH
		) -join ";"
		& (Join-Path $runtimeTarget "node.exe") $appTarget @CliArguments
		exit $LASTEXITCODE
	}

	Write-BootstrapStep -Id "distribution-manifest" -State "CHECK" -Message "배포 manifest와 모든 SHA-256을 확인했습니다."
	$runtimeSource = Join-Path $distributionRoot ([string]$manifest.runtime.source)
	$runtimeTarget = Join-Path $installRoot ([string]$manifest.runtime.target)
	$state = Install-FileOrDirectory -Source $runtimeSource -Target $runtimeTarget
	Write-BootstrapStep -Id "runtime-node" -State $state -Message "app-local Node runtime을 준비했습니다."

	$appSource = Join-Path $distributionRoot ([string]$manifest.application.source)
	$appTarget = Join-Path $installRoot ([string]$manifest.application.target)
	$state = Install-FileOrDirectory -Source $appSource -Target $appTarget -Refresh:$sourceChanged
	$officeQaSource = Join-Path $distributionRoot "dist\office-qa"
	$officeQaTarget = Join-Path $installRoot "office-qa"
	$officeQaState = Install-FileOrDirectory -Source $officeQaSource -Target $officeQaTarget -Refresh:$sourceChanged
	if ($officeQaState -eq "INSTALL") { $state = "INSTALL" }
	Write-BootstrapStep -Id "application" -State $state -Message "KCH PowerPoint application을 준비했습니다."

	$fontSource = Join-Path $distributionRoot ([string]$manifest.fonts.source)
	$assetSource = Split-Path -Parent $fontSource
	$assetTarget = Join-Path $installRoot "assets"
	$state = Install-FileOrDirectory -Source $assetSource -Target $assetTarget -Refresh:$sourceChanged
	Register-PretendardFonts -Source $fontSource
	Write-BootstrapStep -Id "fonts-pretendard" -State $state -Message "Pretendard 글꼴을 사용자 범위로 준비했습니다."

	foreach ($provider in @("claude", "codex")) {
		$source = Get-ToolSourceRoot -DistributionRoot $distributionRoot -RootPackage $manifest.tools.$provider.rootPackage
		$target = Join-Path $installRoot ("tools\" + $provider)
		$state = Install-FileOrDirectory -Source $source -Target $target -Refresh:$sourceChanged
		Write-BootstrapStep -Id ($provider + "-cli") -State $state -Message ($provider + " CLI를 app-local로 준비했습니다.")
	}
	$state = Install-ManagedPlugin -Source $claudePluginSource -SkillsRoot $claudeSkillsRoot
	Write-BootstrapStep -Id "claude-kchppt" -State $state -Message "Claude Code kchppt 스킬을 사용자 범위로 준비했습니다."
	$state = Install-ManagedPlugin -Source $codexPluginSource -SkillsRoot $codexSkillsRoot
	Write-BootstrapStep -Id "codex-kchppt" -State $state -Message "Codex kchppt 스킬을 사용자 범위로 준비했습니다."
	Write-BootstrapStep -Id "provider-auth" -State "CHECK" -Message "기존 사용자 provider 인증을 재사용합니다."
	$officeType = [type]::GetTypeFromProgID("PowerPoint.Application")
	Write-BootstrapStep -Id "office-qa" -State $(if ($null -eq $officeType) { "WARN" } else { "CHECK" }) `
		-SupportTier $(if ($null -eq $officeType) { "B" } else { "A" }) `
		-Message $(if ($null -eq $officeType) { "PowerPoint가 없어 렌더 검증을 생략합니다." } else { "PowerPoint COM을 사용할 수 있습니다." })

	New-Item -ItemType Directory -Path $installRoot -Force | Out-Null
	@{ lockSha256 = $manifest.lockSha256; sourceSha256 = $manifest.sourceSha256; files = New-InstallReceipt -InstallRoot $installRoot } |
		ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $markerPath -Encoding UTF8

	if (-not $BootstrapDiagnose) {
		$node = Join-Path $runtimeTarget "node.exe"
		$env:PATH = @(
			(Join-Path $installRoot "tools\codex\bin"),
			(Join-Path $installRoot "tools\claude\bin"),
			$runtimeTarget,
			$env:PATH
		) -join ";"
		& $node $appTarget @CliArguments
		exit $LASTEXITCODE
	}
	exit 0
}
catch {
	Write-BootstrapStep -Id "bootstrap" -State "BLOCKED" -SupportTier "C" -Message $_.Exception.Message `
		-Path $manifestPath -Sha256 ("0" * 64) -ItAction "IT 담당자에게 배포 경로와 실행 정책 확인을 요청하세요."
	exit 23
}
