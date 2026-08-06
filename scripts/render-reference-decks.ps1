param(
	[Parameter(Mandatory = $true)][string]$KchDeck,
	[Parameter(Mandatory = $true)][string]$ShinanDeck,
	[Parameter(Mandatory = $true)][string]$OutDir
)

$ErrorActionPreference = "Stop"

function Release-ComObject {
	param([object]$Value)
	if ($null -ne $Value -and [Runtime.InteropServices.Marshal]::IsComObject($Value)) {
		[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($Value)
	}
}

function Render-Deck {
	param(
		[object]$Application,
		[string]$DeckPath,
		[string]$Name
	)
	$target = Join-Path $OutDir $Name
	New-Item -ItemType Directory -Path $target -Force | Out-Null
	$presentation = $null
	try {
		$presentation = $Application.Presentations.Open($DeckPath, $true, $true, $false)
		for ($index = 1; $index -le $presentation.Slides.Count; $index++) {
			$slide = $presentation.Slides.Item($index)
			try {
				$path = Join-Path $target ("slide-{0:D2}.png" -f $index)
				$slide.Export($path, "PNG", 1600, 900)
			}
			finally {
				Release-ComObject $slide
			}
		}
		return [ordered]@{
			name = $Name
			source = $DeckPath
			slides = [int]$presentation.Slides.Count
			output = $target
		}
	}
	finally {
		if ($null -ne $presentation) {
			$presentation.Close()
			Release-ComObject $presentation
		}
	}
}

New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
$application = $null
try {
	$application = New-Object -ComObject PowerPoint.Application
	$results = @(
		Render-Deck -Application $application -DeckPath $KchDeck -Name "kch-group"
		Render-Deck -Application $application -DeckPath $ShinanDeck -Name "shinan-wind"
	)
	[ordered]@{
		powerPointVersion = [string]$application.Version
		renderer = "PowerPoint COM Slide.Export"
		width = 1600
		height = 900
		decks = $results
	} | ConvertTo-Json -Depth 5
}
finally {
	if ($null -ne $application) {
		$application.Quit()
		Release-ComObject $application
	}
	[GC]::Collect()
	[GC]::WaitForPendingFinalizers()
}
