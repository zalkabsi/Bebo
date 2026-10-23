$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$scriptPath = Join-Path $projectRoot 'docs\neighborhood-hacks-2026-demo-script.md'
$outputDir = Join-Path $projectRoot 'artifacts'
$outputPath = Join-Path $outputDir 'neighborhood-hacks-2026-voiceover.wav'

if (-not (Test-Path -LiteralPath $scriptPath)) {
  throw "Demo narration was not found: $scriptPath"
}

$markdown = [System.IO.File]::ReadAllText($scriptPath)
$segments = @()
$marker = '**Narration:** '
$openingQuote = [char]0x201C
$closingQuote = [char]0x201D
$offset = 0
while (($start = $markdown.IndexOf($marker, $offset, [System.StringComparison]::Ordinal)) -ge 0) {
  $textStart = $start + $marker.Length
  if ($textStart -lt $markdown.Length -and $markdown[$textStart] -eq $openingQuote) {
    $textStart++
  }
  $end = $markdown.IndexOf($closingQuote, $textStart)
  if ($end -lt 0) {
    throw 'A narration paragraph is missing its closing quotation mark.'
  }
  $segments += $markdown.Substring($textStart, $end - $textStart).Trim()
  $offset = $end + 1
}
if ($segments.Count -lt 6) {
  throw "Expected at least six narration sections; found $($segments.Count)."
}

New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
Add-Type -AssemblyName System.Speech
$synthesizer = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $voice = $synthesizer.GetInstalledVoices() |
    ForEach-Object { $_.VoiceInfo } |
    Where-Object { $_.Name -eq 'Microsoft Zira Desktop' } |
    Select-Object -First 1
  if ($null -ne $voice) {
    $synthesizer.SelectVoice($voice.Name)
  }

  $synthesizer.Rate = -1
  $synthesizer.Volume = 100
  $synthesizer.SetOutputToWaveFile($outputPath)
  $synthesizer.Speak(($segments -join ' '))
  $synthesizer.SetOutputToNull()
}
finally {
  $synthesizer.Dispose()
}

$voiceDescription = if ($null -ne $voice) { 'an installed desktop voice' } else { 'the system default desktop voice' }
Write-Output "Created $outputPath using $voiceDescription."
