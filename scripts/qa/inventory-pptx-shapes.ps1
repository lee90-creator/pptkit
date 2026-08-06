param(
	[Parameter(Mandatory = $true)]
	[string]$InputPath,
	[Parameter(Mandatory = $true)]
	[int]$SlideNumber
)

$ErrorActionPreference = "Stop"
$application = $null
$presentation = $null

try {
	$application = New-Object -ComObject PowerPoint.Application
	$presentation = $application.Presentations.Open($InputPath, $true, $true, $false)
	$result = foreach ($shape in $presentation.Slides.Item($SlideNumber).Shapes) {
		[ordered]@{
			name = $shape.Name
			type = $shape.Type
			connector = $shape.Connector
			hasChart = $shape.HasChart
			hasTable = $shape.HasTable
		}
	}
	Write-Output ($result | ConvertTo-Json -Compress)
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
