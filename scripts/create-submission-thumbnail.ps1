Add-Type -AssemblyName System.Drawing

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$scenePath = Join-Path $projectRoot "artifacts\demo-scenes\home.png"
$outputDirectory = Join-Path $projectRoot "docs\assets"
$outputPath = Join-Path $outputDirectory "neighborhood-hacks-2026-thumbnail.png"

if (-not (Test-Path -LiteralPath $scenePath -PathType Leaf)) {
  throw "Run scripts/capture-demo-scenes.mjs first; missing screenshot: $scenePath"
}

New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
$width = 1200
$height = 800
$bitmap = [System.Drawing.Bitmap]::new($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

$background = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
  [System.Drawing.Point]::new(0, 0),
  [System.Drawing.Point]::new($width, $height),
  [System.Drawing.Color]::FromArgb(13, 25, 34),
  [System.Drawing.Color]::FromArgb(23, 76, 65)
)
$white = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(247, 250, 252))
$mint = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(124, 232, 185))
$muted = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(190, 210, 211))
$soft = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(36, 64, 68))
$softPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(82, 137, 128), 1.5)
$frameBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(226, 235, 235))
$framePen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(100, 194, 226, 215), 2)
$shadowBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(65, 0, 0, 0))
$badgeFont = [System.Drawing.Font]::new("Segoe UI", 16, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$titleFont = [System.Drawing.Font]::new("Segoe UI", 88, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$taglineFont = [System.Drawing.Font]::new("Segoe UI", 38, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$bodyFont = [System.Drawing.Font]::new("Segoe UI", 20, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$chipFont = [System.Drawing.Font]::new("Segoe UI", 15, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$noteFont = [System.Drawing.Font]::new("Segoe UI", 15, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$image = $null

try {
  $graphics.FillRectangle($background, 0, 0, $width, $height)
  $glow = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(25, 119, 220, 174))
  $graphics.FillEllipse($glow, 760, -260, 660, 660)
  $graphics.FillEllipse($glow, 420, 530, 470, 470)
  $glow.Dispose()

  $graphics.FillRectangle($soft, 70, 66, 290, 44)
  $graphics.DrawRectangle($softPen, 70, 66, 290, 44)
  $graphics.DrawString("NEIGHBORHOOD HACKS 2026", $badgeFont, $mint, 87, 79)
  $graphics.DrawString("Bebo", $titleFont, $white, 68, 153)
  $graphics.DrawString(
    "AI for the office tools`nyou can access.",
    $taglineFont,
    $mint,
    [System.Drawing.RectangleF]::new(75, 277, 430, 148)
  )
  $graphics.DrawString(
    "A provider-choice AI companion for`naccessible office workflows.",
    $bodyFont,
    $muted,
    [System.Drawing.RectangleF]::new(78, 452, 415, 64)
  )

  $chipY = 562
  $chips = @(
    @{ X = 74; Width = 145; Label = "Provider choice" },
    @{ X = 231; Width = 125; Label = "Open models" },
    @{ X = 368; Width = 150; Label = "Community tools" }
  )
  foreach ($chip in $chips) {
    $graphics.FillRectangle($soft, $chip.X, $chipY, $chip.Width, 38)
    $graphics.DrawRectangle($softPen, $chip.X, $chipY, $chip.Width, 38)
    $graphics.DrawString($chip.Label, $chipFont, $white, $chip.X + 10, $chipY + 9)
  }
  $graphics.DrawString("Excel-first prototype  |  Open source", $noteFont, $muted, 78, 635)

  $graphics.FillRectangle($shadowBrush, 524, 207, 620, 358)
  $graphics.FillRectangle($frameBrush, 514, 197, 620, 358)
  $image = [System.Drawing.Image]::FromFile($scenePath)
  $graphics.DrawImage($image, [System.Drawing.Rectangle]::new(524, 207, 600, 338))
  $graphics.DrawRectangle($framePen, 514, 197, 620, 358)

  $bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $fileInfo = Get-Item -LiteralPath $outputPath
  if ($fileInfo.Length -gt 5MB) { throw "The thumbnail must stay under 5 MB; generated $($fileInfo.Length) bytes." }
  Write-Output ("Created {0} ({1} bytes, {2}x{3})" -f $outputPath, $fileInfo.Length, $width, $height)
}
finally {
  if ($image) { $image.Dispose() }
  $bitmap.Dispose()
  $graphics.Dispose()
  $background.Dispose()
  $white.Dispose()
  $mint.Dispose()
  $muted.Dispose()
  $soft.Dispose()
  $softPen.Dispose()
  $frameBrush.Dispose()
  $framePen.Dispose()
  $shadowBrush.Dispose()
  $badgeFont.Dispose()
  $titleFont.Dispose()
  $taglineFont.Dispose()
  $bodyFont.Dispose()
  $chipFont.Dispose()
  $noteFont.Dispose()
}
