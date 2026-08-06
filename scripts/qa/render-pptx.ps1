param(
	[Parameter(Mandatory = $true)]
	[string]$InputPath,
	[Parameter(Mandatory = $true)]
	[string]$OutputDirectory,
	[int]$Width = 1600,
	[int]$Height = 900,
	[int]$SlideNumber = 0
)

$ErrorActionPreference = "Stop"
$application = $null
$presentation = $null

try {
	New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
	$application = New-Object -ComObject PowerPoint.Application
	$presentation = $application.Presentations.Open($InputPath, $true, $true, $false)
	if ($SlideNumber -gt 0) {
		if ($SlideNumber -gt $presentation.Slides.Count) {
			throw "Slide number exceeds presentation slide count: $SlideNumber"
		}
		$outputPath = Join-Path $OutputDirectory ("slide-" + $SlideNumber + ".png")
		$presentation.Slides.Item($SlideNumber).Export($outputPath, "PNG", $Width, $Height)
		Write-Output ("rendered=1 slide=" + $SlideNumber)
	}
	else {
		$presentation.Export($OutputDirectory, "PNG", $Width, $Height)
		Write-Output ("rendered=" + $presentation.Slides.Count)
	}
}
finally {
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
