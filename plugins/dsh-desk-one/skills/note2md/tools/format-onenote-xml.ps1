<#
.SYNOPSIS
  将 OneNote 导出的 XML 文件排版为缩进多行格式，便于 Agent 完整读取。
.DESCRIPTION
  OneNote 导出的每个页面 XML 往往是超长单行（可达数万字符），
  Agent 的文件读取工具对单行有显示上限，会截断内容导致转换遗漏。
  本脚本将指定目录下的所有 .xml 递归排版为可读的多行缩进格式。

  建议在 {notes_root}/.note2md/import/ 临时暂存区就地执行，或输出到
  <InputDir>_pretty/，绝不要输出到工作区根目录。

.PARAMETER InputDir
  原始 XML 目录（必填）。
.PARAMETER OutputDir
  输出目录（可选）。省略时输出到 <InputDir>_pretty/。
.PARAMETER InPlace
  就地覆盖原始文件（与 OutputDir 互斥）。
.EXAMPLE
  .\format-onenote-xml.ps1 -InputDir "D:\notes\.note2md\import"
  .\format-onenote-xml.ps1 -InputDir "D:\notes\.note2md\import" -InPlace
  .\format-onenote-xml.ps1 -InputDir "D:\notes\.note2md\import" -OutputDir "D:\notes\.note2md\import_pretty"
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$InputDir,

    [string]$OutputDir,

    [switch]$InPlace
)

if (-not (Test-Path $InputDir)) {
    Write-Host "ERROR: Input directory not found: $InputDir" -ForegroundColor Red
    exit 1
}
if ($InPlace -and $OutputDir) {
    Write-Host "ERROR: -InPlace and -OutputDir are mutually exclusive." -ForegroundColor Red
    exit 1
}

if ($InPlace) {
    $destRoot = $InputDir
}
elseif ($OutputDir) {
    $destRoot = $OutputDir
}
else {
    $destRoot = "$InputDir`_pretty"
}

$xmlFiles = Get-ChildItem -Path $InputDir -Recurse -Filter *.xml
$count = 0

foreach ($file in $xmlFiles) {
    try {
        $doc = New-Object System.Xml.XmlDocument
        $doc.PreserveWhitespace = $false
        $doc.Load($file.FullName)

        $relative = $file.FullName.Substring($InputDir.Length).TrimStart('\', '/')
        $outPath = Join-Path $destRoot $relative
        $outDir = Split-Path $outPath -Parent
        New-Item -ItemType Directory -Path $outDir -Force | Out-Null

        $settings = New-Object System.Xml.XmlWriterSettings
        $settings.Indent = $true
        $settings.IndentChars = "  "
        $settings.Encoding = New-Object System.Text.UTF8Encoding($false)
        $settings.NewLineChars = "`r`n"

        $writer = [System.Xml.XmlWriter]::Create($outPath, $settings)
        $doc.Save($writer)
        $writer.Close()

        $count++
        Write-Host "OK: $relative" -ForegroundColor Green
    }
    catch {
        Write-Host "FAIL: $($file.Name) -- $_" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "========== DONE ==========" -ForegroundColor Cyan
Write-Host "Formatted: $count XML files"
Write-Host "Output:    $destRoot"
