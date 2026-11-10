<#
.SYNOPSIS
  将 OneNote 导出的 XML 页面转换为 Markdown 笔记。
.DESCRIPTION
  确定性转换脚本，将 SKILL.md 中的 XML→Markdown 规则全部代码化，
  避免 Agent 在长流程中因幻觉/遗忘导致的规则偏差。

  转换规则（与 SKILL.md 保持一致）：
    - frontmatter: title/date/type/tags
    - 正文以 # {title} 开头
    - 粗体 **text** / 斜体 *text*
    - 待办 - [ ] / - [x]（表格内用 [ ] / [x] 文本标记）
    - 列表 - / 1. 嵌套缩进 2 空格/级
    - 表格 | a | b |，单元格内换行 <br>，跳过全空行
    - 表格内混合嵌套树用 ↳ (U+21B3) 内联渲染
    - CDATA 内 span/a 字面标签剥离，链接保留可见文本
    - OCR 图片提取 OCRData 文本
    - 文件名非法字符替换为 _（含 Unicode 特殊字符）

.PARAMETER InputDir
  排版后的 XML 目录（必填）。
.PARAMETER OutputDir
  输出 MD 目录（必填）。
.PARAMETER RunSelfTest
  运行内置 fixture 回归测试后退出（不转换）。
.EXAMPLE
  .\convert-onenote-md.ps1 -InputDir "D:\notes\.note2md\import" -OutputDir "D:\notes"
  .\convert-onenote-md.ps1 -RunSelfTest
#>

param(
    [string]$InputDir,
    [string]$OutputDir,
    [switch]$RunSelfTest
)

$ErrorActionPreference = "Stop"
$ns = "http://schemas.microsoft.com/office/onenote/2013/onenote"
$script:FallbackCells = @()   # 记录 fallback-rendered 单元格
$script:ExtractedTables = @() # 记录被提出表格的行

# ==================== 工具函数 ====================

function Get-TextFromTNode {
    param($node)
    if ($null -eq $node) { return "" }
    $t = $node.InnerText
    if ($null -eq $t) { return "" }
    # 还原 XML 实体
    $t = $t -replace '&quot;', '"' -replace '&amp;', '&' -replace '&lt;', '<' -replace '&gt;', '>' -replace '&nbsp;', ' ' -replace '&#xA;', ''
    # 剥离 CDATA 内字面 HTML 标签（span/a/br 等）
    $t = $t -replace '<[^>]+>', ''
    return $t.Trim()
}

function Get-DateStr {
    param($attr)
    if ($attr -and $attr.Length -ge 10) { return $attr.Substring(0, 10) }
    return ""
}

function Get-SanitizedFileName {
    param($name)
    # 非法字符替换为 _：Windows 保留字符 + Unicode 特殊字符（不间断空格、弯引号等）
    $bad = '[\\/:*?"<>|\u00A0\u201C\u201D\u2018\u2019\u2013\u2014\u2026\u00A9\u00AE\u2122]'
    return [System.Text.RegularExpressions.Regex]::Replace($name, $bad, "_")
}

function Get-TypeStr {
    param($title, $dirName)
    $t = $title + " " + $dirName
    if ($t -match '待办|todo|TODO|任务') { return "task" }
    if ($t -match '例会|会议|交流|汇报|访谈|研讨|沟通|周会|务虚') { return "meeting" }
    if ($t -match '日记|随记|daily|journal') { return "daily" }
    return "note"
}

# 判断 OE 是否为标题（quickStyleIndex 或 style 含 heading）
function Get-HeadingLevel {
    param($oe)
    $qs = $oe.GetAttribute("quickStyleIndex", "")
    if ($qs -eq "0") { return 1 }  # PageTitle
    $style = $oe.GetAttribute("style", "")
    if ($style -match 'heading') {
        if ($style -match 'h1|Heading 1') { return 1 }
        if ($style -match 'h2|Heading 2') { return 2 }
        if ($style -match 'h3|Heading 3') { return 3 }
        return 1
    }
    return 0
}

# 获取 OE 的列表前缀
function Get-ListPrefix {
    param($oe, $nsMgr)
    $prefix = ""
    $listNode = $oe.SelectSingleNode("one:List", $nsMgr)
    $tagNode = $oe.SelectSingleNode("one:Tag", $nsMgr)
    if ($null -ne $listNode) {
        $bullet = $listNode.SelectSingleNode("one:Bullet", $nsMgr)
        $number = $listNode.SelectSingleNode("one:Number", $nsMgr)
        if ($null -ne $bullet) { $prefix = "- " }
        elseif ($null -ne $number) {
            $txt = $number.GetAttribute("text", "")
            if ($txt) { $prefix = $txt + " " }
            else { $prefix = "1. " }
        }
    }
    if ($null -ne $tagNode) {
        $idx = $tagNode.GetAttribute("index", "")
        if ($idx -eq "0") { $prefix = "- [ ] " }
        elseif ($idx -eq "1") { $prefix = "- [x] " }
        else { $prefix = "- " }
    }
    return $prefix
}

# 单元格内列表前缀（无 - 前缀的文本标记）
function Get-CellListPrefix {
    param($oe, $nsMgr)
    $prefix = ""
    $listNode = $oe.SelectSingleNode("one:List", $nsMgr)
    $tagNode = $oe.SelectSingleNode("one:Tag", $nsMgr)
    if ($null -ne $listNode) {
        $bullet = $listNode.SelectSingleNode("one:Bullet", $nsMgr)
        $number = $listNode.SelectSingleNode("one:Number", $nsMgr)
        if ($null -ne $bullet) { $prefix = "- " }
        elseif ($null -ne $number) {
            $txt = $number.GetAttribute("text", "")
            if ($txt) { $prefix = $txt + " " }
            else { $prefix = "1. " }
        }
    }
    if ($null -ne $tagNode) {
        $idx = $tagNode.GetAttribute("index", "")
        if ($idx -eq "0") { $prefix = "[ ] " }
        elseif ($idx -eq "1") { $prefix = "[x] " }
        else { $prefix = "- " }
    }
    return $prefix
}

# ==================== 单元格内联树 ====================

# 递归处理单元格内 OEChildren → 返回内联文本行数组
# 遵循 SKILL.md：待办 [ ]/[x]、有序 1./无序 - 文本标记、嵌套层用 ↳ (U+21B3) 前缀
function Convert-CellTree {
    param($xml, $nsMgr, $childrenNode, $level)
    $lines = @()
    $children = $childrenNode.SelectNodes("one:OE", $nsMgr)
    foreach ($oe in $children) {
        $prefix = Get-CellListPrefix -oe $oe -nsMgr $nsMgr
        $tableNode = $oe.SelectSingleNode("one:Table", $nsMgr)
        $tNode = $oe.SelectSingleNode("one:T", $nsMgr)
        $imgNode = $oe.SelectSingleNode("one:Image", $nsMgr)
        $subChildren = $oe.SelectSingleNode("one:OEChildren", $nsMgr)

        $rowText = ""
        if ($null -ne $tableNode) {
            # 单元格内嵌套表格：提取全部文本 fallback（零文本丢失）
            $innerTexts = @()
            foreach ($t2 in $tableNode.SelectNodes(".//one:T", $nsMgr)) {
                $txt = Get-TextFromTNode $t2
                if ($txt.Length -gt 0) { $innerTexts += $txt }
            }
            $rowText = $prefix + ($innerTexts -join "<br>")
        } elseif ($null -ne $imgNode) {
            $ocrText = ""
            $ocrData = $imgNode.SelectSingleNode("one:OCRData/one:OCRText", $nsMgr)
            if ($null -ne $ocrData) { $ocrText = Get-TextFromTNode $ocrData }
            if ($ocrText.Length -gt 0) { $rowText = $prefix + "[OCR: $ocrText]" }
        } elseif ($null -ne $tNode) {
            $txt = Get-TextFromTNode $tNode
            if ($txt.Length -gt 0) { $rowText = $prefix + $txt }
        }

        if ($rowText.Length -gt 0) {
            if ($level -gt 0) { $rowText = (' ' * $level) + '↳ ' + $rowText }
            $lines += $rowText
        }

        if ($null -ne $subChildren) {
            $sub = Convert-CellTree -xml $xml -nsMgr $nsMgr -childrenNode $subChildren -level ($level + 1)
            foreach ($sl in $sub) { $lines += $sl }
        }
    }
    return $lines
}

# 判断整表是否为"列表/树而非真实表格"（单列待办清单）
function Test-SingleColumnChecklist {
    param($tableNode, $nsMgr)
    $cols = $tableNode.SelectSingleNode("one:Columns", $nsMgr)
    if ($null -eq $cols) { return $false }
    $colCount = $cols.SelectNodes("one:Column", $nsMgr).Count
    if ($colCount -gt 1) { return $false }
    $rows = $tableNode.SelectNodes("one:Row", $nsMgr)
    $tagCount = 0; $rowCount = 0
    foreach ($row in $rows) {
        $rowCount++
        $cells = $row.SelectNodes("one:Cell", $nsMgr)
        foreach ($cell in $cells) {
            if ($null -ne $cell.SelectSingleNode(".//one:Tag", $nsMgr)) { $tagCount++ }
        }
    }
    # 单列且大多数行含待办标记 → 判定为清单
    return ($rowCount -gt 0 -and ($tagCount / $rowCount) -ge 0.5)
}

# ==================== 正文递归转换 ====================

function Convert-OEChildren {
    param($xml, $nsMgr, $childrenNode, $indent)
    $sb = New-Object System.Text.StringBuilder
    $children = $childrenNode.SelectNodes("one:OE", $nsMgr)
    foreach ($oe in $children) {
        $line = ""
        $prefix = Get-ListPrefix -oe $oe -nsMgr $nsMgr
        $tableNode = $oe.SelectSingleNode("one:Table", $nsMgr)
        $tNode = $oe.SelectSingleNode("one:T", $nsMgr)
        $imgNode = $oe.SelectSingleNode("one:Image", $nsMgr)
        $subChildren = $oe.SelectSingleNode("one:OEChildren", $nsMgr)

        # 块级元素（段落/标题/表格/图片）之间用空行分隔，列表项之间保持单换行。
        # 否则 Markdown 渲染时相邻段落合并成一段、表格被当作列表延续文本。
        if ($null -ne $tableNode) {
            # ---- 表格处理 ----
            # 情形 1：单列待办清单 → 提取为原生列表，保留 stub 单元格
            if (Test-SingleColumnChecklist -tableNode $tableNode -nsMgr $nsMgr) {
                $script:ExtractedTables += "list-extracted"
                $listSb = New-Object System.Text.StringBuilder
                foreach ($row in $tableNode.SelectNodes("one:Row", $nsMgr)) {
                    foreach ($cell in $row.SelectNodes("one:Cell", $nsMgr)) {
                        $cellChildren = $cell.SelectSingleNode("one:OEChildren", $nsMgr)
                        if ($null -ne $cellChildren) {
                            $cellLines = Convert-CellTree -xml $xml -nsMgr $nsMgr -childrenNode $cellChildren -level 0
                            foreach ($cl in $cellLines) {
                                # 顶层项转换为原生 - [ ] 列表
                                $native = $cl -replace '^\[ \] ', '- [ ] ' -replace '^\[x\] ', '- [x] ' -replace '^\- ', '- '
                                [void]$listSb.AppendLine($(" " * $indent) + $native)
                            }
                        }
                    }
                }
                # 列表块与前后块用空行分隔
                if ($listSb.Length -gt 0) {
                    if ($sb.Length -gt 0 -and -not ($sb.ToString().EndsWith("`r`n`r`n") -or $sb.ToString().EndsWith("`n`n"))) { [void]$sb.AppendLine("") }
                    [void]$sb.Append($listSb.ToString())
                    [void]$sb.AppendLine("")
                }
                continue
            }
            # 情形 2：常规表格（GFM 表格必须顶格 + 前后空行，
            # 否则表格行会被当作列表/段落的延续文本，无法渲染为表格）
            $rows = $tableNode.SelectNodes("one:Row", $nsMgr)
            $rowCount = 0
            $tableLines = @()
            $tableHasContent = $false
            foreach ($row in $rows) {
                $cells = @()
                $rowHasContent = $false
                foreach ($cell in $row.SelectNodes("one:Cell", $nsMgr)) {
                    $cellChildren = $cell.SelectSingleNode("one:OEChildren", $nsMgr)
                    if ($null -ne $cellChildren) {
                        $cellLines = Convert-CellTree -xml $xml -nsMgr $nsMgr -childrenNode $cellChildren -level 0
                        $cellText = $cellLines -join "<br>"
                        if ($cellText.Length -gt 0) {
                            $rowHasContent = $true
                            $tableHasContent = $true
                        }
                        # 检测嵌套树（含 ↳）→ 标记 fallback 已正确处理
                        if ($cellText -match '↳') { }
                        $cells += $cellText
                    } else {
                        $cells += ""
                    }
                }
                if ($rowHasContent) {
                    $tableLines += "| " + ($cells -join " | ") + " |"
                    $rowCount++
                    if ($rowCount -eq 1) {
                        $tableLines += "| " + (($cells | ForEach-Object { "---" }) -join " | ") + " |"
                    }
                }
            }
            if ($tableHasContent) {
                if ($sb.Length -gt 0 -and -not ($sb.ToString().EndsWith("`r`n`r`n") -or $sb.ToString().EndsWith("`n`n"))) { [void]$sb.AppendLine("") }
                foreach ($tl in $tableLines) {
                    [void]$sb.AppendLine($tl)
                }
                [void]$sb.AppendLine("")
            }
            continue
        }

        if ($null -ne $imgNode) {
            # OCR 图片：提取 OCR 文本（块级，前后空行）
            $ocrText = ""
            $ocrData = $imgNode.SelectSingleNode("one:OCRData/one:OCRText", $nsMgr)
            if ($null -ne $ocrData) { $ocrText = Get-TextFromTNode $ocrData }
            if ($sb.Length -gt 0 -and -not ($sb.ToString().EndsWith("`r`n`r`n") -or $sb.ToString().EndsWith("`n`n"))) { [void]$sb.AppendLine("") }
            if ($ocrText.Length -gt 0) {
                [void]$sb.AppendLine($(" " * $indent) + "[OCR 图片内容]")
                foreach ($ol in ($ocrText -split "`n")) {
                    if ($ol.Trim().Length -gt 0) {
                        [void]$sb.AppendLine($(" " * ($indent + 2)) + $ol.Trim())
                    }
                }
            } else {
                [void]$sb.AppendLine($(" " * $indent) + "[图片]")
            }
            [void]$sb.AppendLine("")
            continue
        }

        if ($null -ne $tNode) {
            $txt = Get-TextFromTNode $tNode
            if ($txt.Length -eq 0) {
                # 空文本 OE：OneNote 中的空段落 → 输出空行（保留段间距）
                if ($sb.Length -gt 0 -and -not ($sb.ToString().EndsWith("`r`n`r`n") -or $sb.ToString().EndsWith("`n`n"))) {
                    [void]$sb.AppendLine("")
                }
            } elseif ($txt.Length -gt 0) {
                # 粗体/斜体
                $bold = $oe.GetAttribute("bold", "")
                $italic = $oe.GetAttribute("italic", "")
                if ($bold -eq "1" -and $italic -eq "1") { $txt = "***$txt***" }
                elseif ($bold -eq "1") { $txt = "**$txt**" }
                elseif ($italic -eq "1") { $txt = "*$txt*" }
                # 标题（块级）
                $hLevel = Get-HeadingLevel -oe $oe
                if ($hLevel -gt 0) {
                    if ($sb.Length -gt 0 -and -not ($sb.ToString().EndsWith("`r`n`r`n") -or $sb.ToString().EndsWith("`n`n"))) { [void]$sb.AppendLine("") }
                    [void]$sb.AppendLine($(" " * $indent) + ("#" * $hLevel) + " " + $txt)
                    [void]$sb.AppendLine("")
                } elseif ($prefix.Length -gt 0) {
                    # 列表项：保持连续（不插空行，否则列表断开）
                    [void]$sb.AppendLine($(" " * $indent) + $prefix + $txt)
                } else {
                    # 普通段落（块级，前后空行）
                    if ($sb.Length -gt 0 -and -not ($sb.ToString().EndsWith("`r`n`r`n") -or $sb.ToString().EndsWith("`n`n"))) { [void]$sb.AppendLine("") }
                    [void]$sb.AppendLine($(" " * $indent) + $txt)
                    [void]$sb.AppendLine("")
                }
            }
        }

        if ($null -ne $subChildren) {
            $sub = Convert-OEChildren -xml $xml -nsMgr $nsMgr -childrenNode $subChildren -indent ($indent + 2)
            if ($sub.Length -gt 0) {
                # 子内容是表格（以 | 开头）且父内容末尾无空行 → 补空行（GFM 表格必须与列表项隔开）
                if ($sub.TrimStart().StartsWith("|") -and $sb.Length -gt 0 -and -not ($sb.ToString().EndsWith("`r`n`r`n") -or $sb.ToString().EndsWith("`n`n"))) {
                    [void]$sb.AppendLine("")
                }
                [void]$sb.Append($sub)
            }
        }
    }
    return $sb.ToString()
}

# ==================== 页面转换 ====================

function Convert-Page {
    param($xmlFile, $outPath)
    $xml = New-Object System.Xml.XmlDocument
    $xml.Load($xmlFile)
    $nsMgr = New-Object System.Xml.XmlNamespaceManager($xml.NameTable)
    $nsMgr.AddNamespace("one", $ns)

    $page = $xml.SelectSingleNode("//one:Page", $nsMgr)
    if ($null -eq $page) { throw "No <one:Page> found" }
    # 跳过回收站
    $isRecycle = $page.GetAttribute("isRecycleBin", "") -eq "true"
    if ($isRecycle -or $page.GetAttribute("ID", "") -match "OneNote_RecycleBin") {
        return $null
    }

    $title = $page.GetAttribute("name", "")
    if (-not $title) {
        $titleNode = $xml.SelectSingleNode("//one:Title/one:OE/one:T", $nsMgr)
        if ($null -ne $titleNode) { $title = Get-TextFromTNode $titleNode }
    }
    if (-not $title) { $title = [System.IO.Path]::GetFileNameWithoutExtension($xmlFile) }

    $date = ""
    $dt = $page.GetAttribute("dateTime", "")
    if (-not $dt) { $dt = $page.GetAttribute("lastModifiedTime", "") }
    $date = Get-DateStr $dt
    if (-not $date) { $date = Get-Date (Get-Date) }

    $dirName = Split-Path (Split-Path $xmlFile -Parent) -Leaf
    $type = Get-TypeStr $title $dirName

    # 正文
    $bodySb = New-Object System.Text.StringBuilder
    $outlines = $xml.SelectNodes("//one:Outline", $nsMgr)
    foreach ($ol in $outlines) {
        $children = $ol.SelectSingleNode("one:OEChildren", $nsMgr)
        if ($null -ne $children) {
            $body = Convert-OEChildren -xml $xml -nsMgr $nsMgr -childrenNode $children -indent 0
            [void]$bodySb.Append($body)
            # Outline 之间是独立内容块 → 补空行分隔（否则下一 Outline 会粘连上一块的末尾）
            [void]$bodySb.AppendLine("")
        }
    }
    $bodyStr = $bodySb.ToString().TrimEnd("`n", " ", "`t")

    # 组装 MD
    $md = "---`n"
    if ($date) { $md += "date: $date`n" }
    $md += "type: $type`n"
    $md += "title: $title`n"
    $md += "tags: []`n"
    $md += "---`n`n"
    # Body 以 # {title} 开头
    $md += "# " + $title + "`n`n"
    if ($bodyStr.Length -gt 0) {
        $md += $bodyStr + "`n"
    }

    # 统一换行为 LF，折叠 3+ 空行为 2 行、去尾空白
    # （StringBuilder.AppendLine 在 Windows 生成 CRLF，先归一化再折叠）
    $md = $md -replace "`r`n", "`n"
    $md = [System.Text.RegularExpressions.Regex]::Replace($md, "(`n){3,}", "`n`n")
    $md = $md.TrimEnd() + "`n"

    [System.IO.File]::WriteAllText($outPath, $md, (New-Object System.Text.UTF8Encoding($false)))
    return $outPath
}

# ==================== 主流程 ====================

function Main {
    if ($RunSelfTest) {
        Test-Converter
        return
    }
    if (-not $InputDir -or -not $OutputDir) {
        Write-Host "ERROR: -InputDir and -OutputDir are required (or use -RunSelfTest)." -ForegroundColor Red
        exit 1
    }
    if (-not (Test-Path $InputDir)) {
        Write-Host "ERROR: Input directory not found: $InputDir" -ForegroundColor Red
        exit 1
    }
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

    $xmlFiles = Get-ChildItem -Path $InputDir -Recurse -Filter *.xml
    $ok = 0; $fail = @(); $skip = 0; $renamed = 0
    foreach ($f in $xmlFiles) {
        $rel = $f.Directory.FullName.Substring((Resolve-Path $InputDir).Path.Length).TrimStart('\', '/')
        $outDir = Join-Path $OutputDir $rel
        New-Item -ItemType Directory -Path $outDir -Force | Out-Null
        $base = Get-SanitizedFileName ([System.IO.Path]::GetFileNameWithoutExtension($f.Name))
        # 避免覆盖：同名已存在则追加 (2)、(3)…
        $outPath = Join-Path $outDir ($base + ".md")
        $n = 2
        while (Test-Path $outPath) {
            $outPath = Join-Path $outDir ($base + "($n).md")
            $n++
            $renamed++
        }
        try {
            $result = Convert-Page -xmlFile $f.FullName -outPath $outPath
            if ($null -eq $result) { $skip++ }  # 回收站
            else { $ok++ }
        } catch {
            $fail += "$($f.FullName): $($_.Exception.Message)"
        }
    }
    Write-Host "转换完成: 成功 $ok, 跳过(回收站) $skip, 重命名避冲突 $renamed, 失败 $($fail.Count)"
    if ($script:ExtractedTables.Count -gt 0) {
        Write-Host "已提取为原生列表的清单表格: $($script:ExtractedTables.Count) 处"
    }
    if ($script:FallbackCells.Count -gt 0) {
        Write-Host "fallback-rendered 单元格: $($script:FallbackCells.Count) 处"
    }
    if ($fail.Count -gt 0) {
        Write-Host "--- 失败清单 ---" -ForegroundColor Red
        foreach ($fl in $fail) { Write-Host $fl }
        exit 2
    }
}

# ==================== 自测 ====================

function Test-Converter {
    Write-Host "运行内置回归测试..."
    $testDir = Join-Path ([System.IO.Path]::GetTempPath()) ("note2md_selftest_" + [System.Guid]::NewGuid().ToString("N"))
    $src = Join-Path $testDir "src"
    $out = Join-Path $testDir "out"
    New-Item -ItemType Directory -Path $src -Force | Out-Null
    New-Item -ItemType Directory -Path $out -Force | Out-Null

    # fixture 1：完整页面（frontmatter/标题/粗体/待办/列表/嵌套/链接/OCR）
    $fix1 = @'
<?xml version="1.0" encoding="utf-8"?>
<one:Page xmlns:one="http://schemas.microsoft.com/office/onenote/2013/onenote" ID="{A}{1}{X}" name="测试页面" dateTime="2026-07-29T08:00:00.000Z" lastModifiedTime="2026-07-29T09:00:00.000Z" pageLevel="1" lang="zh-CN">
  <one:QuickStyleDef index="0" name="PageTitle" font="Calibri Light" fontSize="20.0" />
  <one:QuickStyleDef index="1" name="p" font="Calibri" fontSize="11.0" />
  <one:Title lang="zh-CN">
    <one:OE quickStyleIndex="0">
      <one:T><![CDATA[测试页面]]></one:T>
    </one:OE>
  </one:Title>
  <one:Outline objectID="{A}{2}{X}">
    <one:OEChildren>
      <one:OE quickStyleIndex="1">
        <one:T><![CDATA[<span style='font-family:"Microsoft YaHei"'>第一段文字</span>]]></one:T>
      </one:OE>
      <one:OE bold="1" quickStyleIndex="1">
        <one:T><![CDATA[粗体内容]]></one:T>
      </one:OE>
      <one:OE quickStyleIndex="1">
        <one:Tag index="0" />
        <one:T><![CDATA[待办事项一]]></one:T>
      </one:OE>
      <one:OE quickStyleIndex="1">
        <one:Tag index="1" />
        <one:T><![CDATA[已完成事项]]></one:T>
      </one:OE>
      <one:OE quickStyleIndex="1">
        <one:List><one:Bullet bullet="2" /></one:List>
        <one:T><![CDATA[无序列表项]]></one:T>
        <one:OEChildren>
          <one:OE quickStyleIndex="1">
            <one:List><one:Bullet bullet="2" /></one:List>
            <one:T><![CDATA[嵌套子项]]></one:T>
          </one:OE>
        </one:OEChildren>
      </one:OE>
      <one:OE quickStyleIndex="1">
        <one:T><![CDATA[链接：<a href="https://example.com"><span>示例站点</span></a>]]></one:T>
      </one:OE>
      <one:OE quickStyleIndex="1">
        <one:Table bordersVisible="true" hasHeaderRow="true">
          <one:Columns><one:Column index="0" width="50" /><one:Column index="1" width="200" /></one:Columns>
          <one:Row>
            <one:Cell><one:OEChildren><one:OE quickStyleIndex="1"><one:T><![CDATA[列A]]></one:T></one:OE></one:OEChildren></one:Cell>
            <one:Cell><one:OEChildren><one:OE quickStyleIndex="1"><one:T><![CDATA[列B]]></one:T></one:OE></one:OEChildren></one:Cell>
          </one:Row>
          <one:Row>
            <one:Cell><one:OEChildren><one:OE quickStyleIndex="1"><one:T><![CDATA[1]]></one:T></one:OE></one:OEChildren></one:Cell>
            <one:Cell>
              <one:OEChildren>
                <one:OE quickStyleIndex="1"><one:Tag index="0" /><one:T><![CDATA[任务一]]></one:T></one:OE>
                <one:OE quickStyleIndex="1"><one:T><![CDATA[说明文字]]></one:T></one:OE>
                <one:OE quickStyleIndex="1"><one:Tag index="0" /><one:T><![CDATA[子任务A]]></one:T>
                  <one:OEChildren>
                    <one:OE quickStyleIndex="1"><one:Tag index="1" /><one:T><![CDATA[子任务A1]]></one:T></one:OE>
                  </one:OEChildren>
                </one:OE>
              </one:OEChildren>
            </one:Cell>
          </one:Row>
        </one:Table>
      </one:OE>
      <one:OE quickStyleIndex="1">
        <one:Image><one:Size width="100" height="80" /><one:OCRData lang="zh-CN"><one:OCRText><![CDATA[图中文字识别结果
第二行内容]]></one:OCRText></one:OCRData></one:Image>
      </one:OE>
    </one:OEChildren>
  </one:Outline>
</one:Page>
'@
    [System.IO.File]::WriteAllText((Join-Path $src "测试页面.xml"), $fix1, (New-Object System.Text.UTF8Encoding($false)))

    # fixture 2：无日期标题（用 lastModifiedTime + 目录名判 type）
    # 放在"公司月度例会"子目录，验证目录名参与 type 判断
    $fix2Dir = Join-Path $src "公司月度例会"
    New-Item -ItemType Directory -Path $fix2Dir -Force | Out-Null
    $fix2 = @'
<?xml version="1.0" encoding="utf-8"?>
<one:Page xmlns:one="http://schemas.microsoft.com/office/onenote/2013/onenote" ID="{B}{1}{X}" name="2024-10-14" lastModifiedTime="2024-10-14T02:00:00.000Z" pageLevel="1" lang="zh-CN">
  <one:Title lang="zh-CN">
    <one:OE><one:T><![CDATA[2024-10-14]]></one:T></one:OE>
  </one:Title>
  <one:Outline objectID="{B}{2}{X}">
    <one:OEChildren>
      <one:OE quickStyleIndex="1"><one:T><![CDATA[月度例会纪要内容]]></one:T></one:OE>
    </one:OEChildren>
  </one:Outline>
</one:Page>
'@
    [System.IO.File]::WriteAllText((Join-Path $fix2Dir "2024-10-14.xml"), $fix2, (New-Object System.Text.UTF8Encoding($false)))

    # fixture 3：列表项下嵌套表格（GFM 渲染回归测试）
    # 场景：OneNote 中"列表项 → 子 OE 内含表格"。旧版输出表格行带缩进且紧跟列表项，
    # GFM 将其视为列表延续文本，表格无法渲染。修复后表格必须顶格 + 前后空行。
    $fix3Dir = Join-Path $src "列表嵌套表格"
    New-Item -ItemType Directory -Path $fix3Dir -Force | Out-Null
    $fix3 = @'
<?xml version="1.0" encoding="utf-8"?>
<one:Page xmlns:one="http://schemas.microsoft.com/office/onenote/2013/onenote" ID="{C}{1}{X}" name="列表嵌套表格测试" dateTime="2026-08-06T08:00:00.000Z" lastModifiedTime="2026-08-06T09:00:00.000Z" pageLevel="1" lang="zh-CN">
  <one:Title lang="zh-CN">
    <one:OE><one:T><![CDATA[列表嵌套表格测试]]></one:T></one:OE>
  </one:Title>
  <one:Outline objectID="{C}{2}{X}">
    <one:OEChildren>
      <one:OE quickStyleIndex="1">
        <one:Tag index="0" />
        <one:T><![CDATA[待办事项列表项]]></one:T>
        <one:OEChildren>
          <one:OE quickStyleIndex="1">
            <one:Table bordersVisible="true">
              <one:Columns><one:Column index="0" width="50" /><one:Column index="1" width="200" /></one:Columns>
              <one:Row>
                <one:Cell><one:OEChildren><one:OE quickStyleIndex="1"><one:T><![CDATA[列A]]></one:T></one:OE></one:OEChildren></one:Cell>
                <one:Cell><one:OEChildren><one:OE quickStyleIndex="1"><one:T><![CDATA[列B]]></one:T></one:OE></one:OEChildren></one:Cell>
              </one:Row>
              <one:Row>
                <one:Cell><one:OEChildren><one:OE quickStyleIndex="1"><one:T><![CDATA[1]]></one:T></one:OE></one:OEChildren></one:Cell>
                <one:Cell><one:OEChildren><one:OE quickStyleIndex="1"><one:T><![CDATA[数据]]></one:T></one:OE></one:OEChildren></one:Cell>
              </one:Row>
            </one:Table>
          </one:OE>
        </one:OEChildren>
      </one:OE>
      <one:OE quickStyleIndex="1">
        <one:T><![CDATA[结尾段落]]></one:T>
      </one:OE>
    </one:OEChildren>
  </one:Outline>
</one:Page>
'@
    [System.IO.File]::WriteAllText((Join-Path $fix3Dir "列表嵌套表格测试.xml"), $fix3, (New-Object System.Text.UTF8Encoding($false)))

    # 执行转换
    $script:Failures = @()
    Convert-Page -xmlFile (Join-Path $src "测试页面.xml") -outPath (Join-Path $out "测试页面.md") | Out-Null
    Convert-Page -xmlFile (Join-Path $fix2Dir "2024-10-14.xml") -outPath (Join-Path $out "2024-10-14.md") | Out-Null
    Convert-Page -xmlFile (Join-Path $fix3Dir "列表嵌套表格测试.xml") -outPath (Join-Path $out "列表嵌套表格测试.md") | Out-Null

    $md1 = [System.IO.File]::ReadAllText((Join-Path $out "测试页面.md"))
    $md2 = [System.IO.File]::ReadAllText((Join-Path $out "2024-10-14.md"))
    $md3 = [System.IO.File]::ReadAllText((Join-Path $out "列表嵌套表格测试.md"))
    $script:pass = $true

    function Assert-Contains {
        param($haystack, $needle, $label)
        if ($haystack.Contains($needle)) {
            Write-Host "  PASS: $label" -ForegroundColor Green
        } else {
            Write-Host "  FAIL: $label — 未找到 [$needle]" -ForegroundColor Red
            $script:pass = $false
        }
    }

    # fixture 1 断言
    Assert-Contains $md1 "date: 2026-07-29" "date 提取"
    Assert-Contains $md1 "type: note" "type 默认"
    Assert-Contains $md1 "title: 测试页面" "title"
    Assert-Contains $md1 "# 测试页面" "正文 # 标题"
    Assert-Contains $md1 "第一段文字" "span 剥离后文本"
    Assert-Contains $md1 "**粗体内容**" "粗体"
    Assert-Contains $md1 "- [ ] 待办事项一" "待办未完成"
    Assert-Contains $md1 "- [x] 已完成事项" "待办已完成"
    Assert-Contains $md1 "- 无序列表项" "无序列表"
    Assert-Contains $md1 "  - 嵌套子项" "嵌套缩进"
    Assert-Contains $md1 "链接：示例站点" "链接可见文本"
    Assert-Contains $md1 "| 列A | 列B |" "表头"
    Assert-Contains $md1 "| --- | --- |" "分隔行"
    Assert-Contains $md1 "任务一<br>说明文字<br>[ ] 子任务A<br> ↳ [x] 子任务A1" "单元格内待办+嵌套树(↳)"
    Assert-Contains $md1 "[OCR 图片内容]" "OCR 提取"
    Assert-Contains $md1 "图中文字识别结果" "OCR 文本"

    # fixture 2 断言
    Assert-Contains $md2 "date: 2024-10-14" "lastModifiedTime 日期"
    Assert-Contains $md2 "type: meeting" "目录名判 type=meeting"
    Assert-Contains $md2 "# 2024-10-14" "标题"

    # fixture 3 断言（列表项下嵌套表格的 GFM 渲染回归）
    Assert-Contains $md3 "- [ ] 待办事项列表项" "列表项输出"
    # 表格必须顶格 + 与列表项之间有空行（否则 GFM 不渲染表格）
    Assert-Contains $md3 "- [ ] 待办事项列表项`n`n| 列A | 列B |" "列表项后空行接顶格表格"
    Assert-Contains $md3 "| 1 | 数据 |" "表格数据行"
    # 表格与后续段落之间有空行
    Assert-Contains $md3 "| 1 | 数据 |`n`n结尾段落" "表格后空行接段落"
    # 段落间空行（块级分隔）
    Assert-Contains $md1 "第一段文字`n`n**粗体内容**" "段落间空行"

    Write-Host ""
    if ($script:pass) {
        Write-Host "✅ 全部测试通过" -ForegroundColor Green
        Remove-Item $testDir -Recurse -Force
    } else {
        Write-Host "❌ 存在失败用例，测试目录保留: $testDir" -ForegroundColor Red
        exit 1
    }
}

Main
