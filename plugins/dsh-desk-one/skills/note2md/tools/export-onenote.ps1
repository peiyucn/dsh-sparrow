<#
.SYNOPSIS
  从 OneNote 桌面版导出所有笔记本为 XML 文件
.DESCRIPTION
  使用 OneNote COM API 遍历所有笔记本→分区→页面，导出为 XML。
  自动跳过回收站（OneNote_RecycleBin）。
  OutputDir 为必填参数 — 由调用方（Agent）显式指定，通常为 {notes_root}/.note2md/import/。
.PARAMETER OutputDir
  导出目标目录（必填）。建议传入笔记根目录下的 .note2md/import/ 临时区，
  切勿使用相对 cwd 的路径，避免导入产物污染工作区。
.EXAMPLE
  .\export-onenote.ps1 -OutputDir "D:\notes\.note2md\import"
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$OutputDir
)

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
    Write-Host "ERROR: -OutputDir is required. Example: export-onenote.ps1 -OutputDir `"<notes_root>/.note2md/import`"" -ForegroundColor Red
    exit 1
}

# 平台保护：OneNote COM API 仅限 Windows。macOS/Linux（pwsh）直接友好退出，
# 不要抛出难懂的 New-Object COM 错误。
if ($PSVersionTable.PSEdition -eq "Core" -and -not $IsWindows) {
    Write-Host "ERROR: export-onenote.ps1 requires Windows + OneNote desktop (COM API)." -ForegroundColor Red
    Write-Host "  On macOS/Linux, export your notebooks to XML elsewhere (e.g. on a Windows machine), then use convert-onenote-md.ps1 to convert." -ForegroundColor Yellow
    exit 1
}

$ErrorActionPreference = "Continue"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$onenote = New-Object -ComObject OneNote.Application
$baseDir = $OutputDir

$hierXml = ""
$onenote.GetHierarchy("", 4, [ref]$hierXml)

$xmlDoc = [xml]$hierXml
$ns = New-Object Xml.XmlNamespaceManager($xmlDoc.NameTable)
$ns.AddNamespace("one", "http://schemas.microsoft.com/office/onenote/2013/onenote")

$notebooks = $xmlDoc.SelectNodes("//one:Notebook", $ns)
$totalPages = 0
$totalSections = 0
$skipped = 0
$failed = 0

function Export-SectionTree($container, $basePath) {
    # 递归处理分区组（SectionGroup），保留 Notebook/SectionGroup*/Section 层级
    $groups = $container.SelectNodes("one:SectionGroup", $ns)
    foreach ($group in $groups) {
        if ($group.GetAttribute("isRecycleBin") -eq "true" -or
            $group.GetAttribute("isInRecycleBin") -eq "true") {
            Write-Host "  Skip group: $($group.GetAttribute('name')) (recycle bin)" -ForegroundColor Gray
            continue
        }
        $groupNameSafe = $group.GetAttribute("name") -replace '[\\/:*?"<>|]', '_'
        Export-SectionTree $group (Join-Path $basePath $groupNameSafe)
    }

    $sections = $container.SelectNodes("one:Section", $ns)
    foreach ($section in $sections) {
        $secName = $section.GetAttribute("name")
        
        # 跳过回收站（OneNote 系统目录，非用户内容）
        if ($section.GetAttribute("isRecycleBin") -eq "true" -or
            $section.GetAttribute("isInRecycleBin") -eq "true" -or
            $section.GetAttribute("isDeletedPages") -eq "true") {
            Write-Host "  Skip: $secName (recycle bin)" -ForegroundColor Gray
            continue
        }
        
        $secNameSafe = $secName -replace '[\\/:*?"<>|]', '_'
        $secPath = Join-Path $basePath $secNameSafe
        
        if (-not (Test-Path $secPath)) {
            New-Item -ItemType Directory -Path $secPath -Force | Out-Null
        }
        
        Write-Host "  Section: $secName" -ForegroundColor Yellow
        $script:totalSections++
        
        $pages = $section.SelectNodes("one:Page", $ns)
        $pageCount = 0
        foreach ($page in $pages) {
            $pageId = $page.GetAttribute("ID")
            $pageName = $page.GetAttribute("name")
            $pageNameSafe = $pageName -replace '[\\/:*?"<>|]', '_'
            $pageFile = Join-Path $secPath "$pageNameSafe.xml"
            
            if (Test-Path $pageFile) {
                Write-Host "    Skip: $pageName (exists)" -ForegroundColor Gray
                $script:skipped++
                continue
            }
            
            try {
                $pageXml = ""
                $onenote.GetPageContent($pageId, [ref]$pageXml, 0)
                # Strip OneNote's own XML declaration (avoids duplicate)
                $pageXml = $pageXml -replace '^<\?xml[^?]*\?>\s*', ''
                $prettyXml = '<?xml version="1.0" encoding="UTF-8"?>' + "`r`n" + $pageXml
                [System.IO.File]::WriteAllText($pageFile, $prettyXml, $utf8NoBom)
                Write-Host "    OK: $pageName" -ForegroundColor Green
                $pageCount++
                $script:totalPages++
                Start-Sleep -Milliseconds 150
            }
            catch {
                Write-Host "    FAIL: $pageName -- $_" -ForegroundColor Red
                $script:failed++
            }
        }
        Write-Host "    ($pageCount pages exported)" -ForegroundColor Gray
    }
}

foreach ($notebook in $notebooks) {
    $nbName = $notebook.GetAttribute("name")
    Write-Host "=== Notebook: $nbName ===" -ForegroundColor Cyan
    Export-SectionTree $notebook (Join-Path $baseDir $nbName)
}

Write-Host ""
Write-Host "========== DONE ==========" -ForegroundColor Cyan
Write-Host "Notebooks: $($notebooks.Count)"
Write-Host "Sections:  $totalSections"
Write-Host "Exported:  $totalPages pages"
Write-Host "Skipped:   $skipped"
Write-Host "Failed:    $failed"

# Release COM object to avoid locking OneNote
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($onenote) | Out-Null
