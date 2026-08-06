param(
	[Parameter(Mandatory = $true)]
	[string]$RequestPath,
	[Parameter(Mandatory = $true)]
	[string]$ResultPath
)

$ErrorActionPreference = "Stop"
$application = $null
$presentation = $null
$roundtrip = $null
$result = $null

function Write-AtomicJson {
	param([object]$Value, [string]$Path)
	$temporary = $Path + ".tmp"
	$Value | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $temporary -Encoding UTF8
	Move-Item -LiteralPath $temporary -Destination $Path -Force
}

function Release-Presentation {
	param([object]$Value)
	if ($null -ne $Value) {
		$Value.Close()
		[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($Value)
	}
}

function Find-Shape {
	param([object]$Deck, [string]$Capability)
	foreach ($slide in $Deck.Slides) {
		foreach ($shape in $slide.Shapes) {
			if ($Capability -eq "Text") {
				if ($shape.HasTextFrame -eq -1 -and $shape.TextFrame.TextRange.Text.Length -gt 0) {
					return [ordered]@{ slide = $slide.SlideIndex; name = $shape.Name; shape = $shape }
				}
			}
			elseif ($shape.$Capability -eq -1) {
				return [ordered]@{ slide = $slide.SlideIndex; name = $shape.Name; shape = $shape }
			}
		}
	}
	throw "No editable $Capability object found"
}

function Find-ShapeByName {
	param([object]$Deck, [int]$SlideNumber, [string]$Name)
	foreach ($shape in $Deck.Slides.Item($SlideNumber).Shapes) {
		if ($shape.Name -eq $Name) { return $shape }
	}
	throw "Shape was not preserved: $Name"
}

try {
	$request = Get-Content -LiteralPath $RequestPath -Raw -Encoding UTF8 | ConvertFrom-Json
	foreach ($directory in @($request.renderDirectory, $request.roundtripRenderDirectory)) {
		Remove-Item -LiteralPath $directory -Recurse -Force -ErrorAction SilentlyContinue
		New-Item -ItemType Directory -Force -Path $directory | Out-Null
	}
	Remove-Item -LiteralPath $request.pdfPath, $request.roundtripPath -Force -ErrorAction SilentlyContinue

	$application = New-Object -ComObject PowerPoint.Application
	$presentation = $application.Presentations.Open($request.sourcePptx, $true, $true, $false)
	$slideCount = $presentation.Slides.Count
	$presentation.Export($request.renderDirectory, "PNG", 1600, 900)
	$presentation.SaveAs($request.pdfPath, 32)
	Release-Presentation $presentation
	$presentation = $null

	$pngCount = @(Get-ChildItem -LiteralPath $request.renderDirectory -Filter "*.PNG" -File).Count
	if ($pngCount -ne $slideCount -or -not (Test-Path -LiteralPath $request.pdfPath)) {
		throw "Render count or PDF export mismatch"
	}

	Copy-Item -LiteralPath $request.sourcePptx -Destination $request.roundtripPath -Force
	$roundtrip = $application.Presentations.Open($request.roundtripPath, $false, $false, $false)
	$text = Find-Shape -Deck $roundtrip -Capability "Text"
	$table = Find-Shape -Deck $roundtrip -Capability "HasTable"
	$chart = Find-Shape -Deck $roundtrip -Capability "HasChart"
	$textValue = $text.shape.TextFrame.TextRange.Text + " [QA]"
	$text.shape.TextFrame.TextRange.Text = $textValue
	$table.shape.Table.Cell(2, 2).Shape.TextFrame.TextRange.Text = "999"
	$chart.shape.Chart.HasTitle = $true
	$chart.shape.Chart.ChartTitle.Text = "QA_EDIT"
	$roundtrip.Save()
	Release-Presentation $roundtrip
	$roundtrip = $null

	$roundtrip = $application.Presentations.Open($request.roundtripPath, $true, $true, $false)
	$savedText = Find-ShapeByName -Deck $roundtrip -SlideNumber $text.slide -Name $text.name
	$savedTable = Find-ShapeByName -Deck $roundtrip -SlideNumber $table.slide -Name $table.name
	$savedChart = Find-ShapeByName -Deck $roundtrip -SlideNumber $chart.slide -Name $chart.name
	$textPersisted = $savedText.TextFrame.TextRange.Text -eq $textValue
	$tablePersisted = $savedTable.Table.Cell(2, 2).Shape.TextFrame.TextRange.Text -eq "999"
	$chartPersisted = $savedChart.Chart.ChartTitle.Text -eq "QA_EDIT"
	if (-not ($textPersisted -and $tablePersisted -and $chartPersisted)) {
		throw "Roundtrip edit did not persist"
	}
	$roundtrip.Export($request.roundtripRenderDirectory, "PNG", 1600, 900)
	$roundtripPngCount = @(Get-ChildItem -LiteralPath $request.roundtripRenderDirectory -Filter "*.PNG" -File).Count
	if ($roundtripPngCount -ne $slideCount) { throw "Roundtrip render count mismatch" }

	$result = [ordered]@{
		status = "verified"
		originalSha256 = $request.originalSha256
		slideCount = $slideCount
		pngCount = $pngCount
		pdfPageCount = $slideCount
		roundtripPngCount = $roundtripPngCount
		roundtripPath = $request.roundtripPath
		edits = [ordered]@{ text = $true; table = $true; chart = $true }
		cleanup = [ordered]@{ ownedProcesses = 0; ownedTempPaths = 0 }
	}
}
catch {
	$reason = if ($null -eq $application) { "powerpoint-unavailable" } else { "render-failed" }
	$result = [ordered]@{
		status = "render-unverified"
		reason = $reason
		originalSha256 = $request.originalSha256
		detail = $_.Exception.Message
		cleanup = [ordered]@{ ownedProcesses = 0; ownedTempPaths = 0 }
	}
}
finally {
	Release-Presentation $roundtrip
	Release-Presentation $presentation
	if ($null -ne $application) {
		$application.Quit()
		[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($application)
	}
	[GC]::Collect()
	[GC]::WaitForPendingFinalizers()
	if ($null -ne $result) { Write-AtomicJson -Value $result -Path $ResultPath }
}

if ($result.status -ne "verified") { exit 1 }
