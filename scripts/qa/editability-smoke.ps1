param(
	[Parameter(Mandatory = $true)]
	[string]$InputPath,
	[Parameter(Mandatory = $true)]
	[string]$OutputPath
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.UTF8Encoding]::new()
$application = $null
$presentation = $null
$reopened = $null

function Find-ShapeByCapability {
	param(
		[object]$Slide,
		[string]$Capability
	)
	foreach ($shape in $Slide.Shapes) {
		if ($shape.$Capability -eq -1) {
			return $shape
		}
	}
	throw "No shape with capability $Capability on slide $($Slide.SlideIndex)"
}

function Find-ShapeByName {
	param(
		[object]$Slide,
		[string]$Name
	)
	foreach ($shape in $Slide.Shapes) {
		if ($shape.Name -eq $Name) {
			return $shape
		}
	}
	throw "No shape named $Name on slide $($Slide.SlideIndex)"
}

try {
	$application = New-Object -ComObject PowerPoint.Application
	$presentation = $application.Presentations.Open($InputPath, $true, $true, $false)

	$chartShape = Find-ShapeByCapability -Slide $presentation.Slides.Item(16) -Capability "HasChart"
	$chartShape.Chart.HasTitle = $true
	$chartShape.Chart.ChartTitle.Text = "편집성 확인"

	$tableShape = Find-ShapeByCapability -Slide $presentation.Slides.Item(14) -Capability "HasTable"
	$tableShape.Table.Cell(2, 2).Shape.TextFrame.TextRange.Text = "999"

	$diagramText = Find-ShapeByName -Slide $presentation.Slides.Item(8) -Name "KCH-root-label"
	$diagramText.TextFrame.TextRange.Text = "KCH그룹 편집 확인"

	$connector = Find-ShapeByName -Slide $presentation.Slides.Item(8) -Name "KCH-edge-0"
	$connector.Line.ForeColor.RGB = 255

	$presentation.SaveAs($OutputPath)
	$presentation.Close()
	[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation)
	$presentation = $null

	$reopened = $application.Presentations.Open($OutputPath, $true, $true, $false)
	$savedChart = Find-ShapeByCapability -Slide $reopened.Slides.Item(16) -Capability "HasChart"
	$savedTable = Find-ShapeByCapability -Slide $reopened.Slides.Item(14) -Capability "HasTable"
	$savedDiagram = Find-ShapeByName -Slide $reopened.Slides.Item(8) -Name "KCH-root-label"
	$savedConnector = Find-ShapeByName -Slide $reopened.Slides.Item(8) -Name "KCH-edge-0"

	$result = [ordered]@{
		chartTitle = $savedChart.Chart.ChartTitle.Text
		tableCell = $savedTable.Table.Cell(2, 2).Shape.TextFrame.TextRange.Text
		diagramText = $savedDiagram.TextFrame.TextRange.Text
		connectorRgb = $savedConnector.Line.ForeColor.RGB
		slides = $reopened.Slides.Count
	}
	if ($result.chartTitle -ne "편집성 확인") { throw "Chart edit did not persist" }
	if ($result.tableCell -ne "999") { throw "Table edit did not persist" }
	if ($result.diagramText -ne "KCH그룹 편집 확인") { throw "Diagram edit did not persist" }
	if ($result.connectorRgb -ne 255) { throw "Connector edit did not persist" }
	$receipt = [ordered]@{
		chartTitlePersisted = $true
		tableCellPersisted = $true
		diagramTextPersisted = $true
		connectorColorPersisted = $true
		slides = $result.slides
	}
	Write-Output ($receipt | ConvertTo-Json -Compress)
}
finally {
	if ($null -ne $reopened) {
		$reopened.Close()
		[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($reopened)
	}
	if ($null -ne $presentation) {
		$presentation.Close()
		[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation)
	}
	if ($null -ne $application) {
		$application.Quit()
		[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($application)
	}
	[GC]::Collect()
	[GC]::WaitForPendingFinalizers()
}
