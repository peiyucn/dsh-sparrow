# 上游性能缺陷：`readFirstZstdLine` 的 O(n²) 缓冲重拼（会话列表冷启动 40–90 s）

> 发现于 2026-09-29，dsh `0.2.0-rc.1`。**这是官方缺陷，不是本插件的问题**；
> 本文件只记录现象、根因、实测数据与处置口径，供上报上游与将来复核。

## 1. 现象

用户在 Web 端打开/刷新页面后，**侧边栏会话列表长时间为空**，几十秒后「突然」全部出现。
易被误判成"会话丢了""归档插件把列表弄没了"。

| 接口 | 修复前实测 | 修复后 |
| :--- | ---: | ---: |
| `POST /api/session/list` | **87.7 s / 47.7 s / 40.2 s**（三次） | **65 ms** |
| 同进程 `session/modelCatalog`（对照） | 44–55 ms | — |
| 插件 `/api/archive-manage/list` | > 20 s（客户端 30 s 超时→失败） | 53 ms |
| 插件 `/api/archive-manage/strays` | 48 s | 8 ms |

对照意义：同一时刻 `modelCatalog` 毫秒级 ⇒ **不是进程卡死、不是网络**，是这一条列举链路。

## 2. 根因

调用链：`session/list` → `sessionQuery.listSessions()` → `sessionPersistence.list()`
→ 对**每个**会话文件读首行 header → `readFirstZstdLine`
（`packages/session/session-persistence-jsonl/src/index.ts:1410`）。

```ts
let content = Buffer.alloc(0)
const chunk = Buffer.alloc(8192)
for (;;) {
  const { bytesRead } = await handle.read(chunk, 0, chunk.length, null)
  if (bytesRead === 0) return undefined
  content = Buffer.concat([content, chunk.subarray(0, bytesRead)])   // ← 每轮重拼整个缓冲
  try {
    const first = scanZstdFrames(content, 1).frames[0]                 // ← 每轮重扫
    if (first === undefined) continue
    const plaintext = await decompressZstdFrame(content.subarray(first.start, first.end))
    assertZstdHeaderFrame(plaintext)                                   // ← 要求首帧恰好是一行 header
    return plaintext.subarray(0, -1).toString('utf8')
  } catch (error) { /* 校验失败按损坏抛错 */ }
}
```

两处放大量：

1. **每 8 KiB 就把整个缓冲 `Buffer.concat` 重拼一次** ⇒ 单文件拷贝量 O(n²/8192)。
2. `assertZstdHeaderFrame` 要求**第一个 zstd 帧恰好只含一行 header**。
   本机 43 个会话文件里有 **33 个是"整文件一个 zstd 帧"**（首帧 = 全文），
   于是官方必须**读完整份文件**才判定它不合规、然后跳过。

估算：33 个不合规文件 + 合规文件累加，全量列举 ≈ **45 GiB 内存拷贝**。
其中单个 `session-64b10290-…`（25.8 MiB）就贡献 **41.6 GiB / 3304 轮**。

## 3. 为什么"没人动它也会变坏"

这 33 个文件的 mtime 集中在很近的时间窗内 —— 一旦某个写入路径产出的日志
**整体只压一帧**（而不是"首帧 header + 后续帧"），它就从"可被列举"变成"每次列举都要被完整读一遍"。
即：**每个不合规会话都在给每一次冷启动加刑**，数量随时间增长。

## 4. 建议修法（按性价比排序）

1. **只收集块、最后拼一次**（最小改动）：循环里 `chunks.push(...)`，
   仅在需要扫帧时对"已收到部分"做拼接 —— 单文件复杂度从 O(n²) 降到 O(n)。
2. **流式解压取首行**（更彻底）：用 zstd 流式解码，解出第一行即停，不必等首帧闭合。
3. **容错口径**：首帧不合规时按"读不到 header 就跳过该会话"，而不是读完整文件去证明它不合规
   （现在是后者，也正是 33 个文件被完整读取的原因）。

## 5. 本仓库的处置（不对上游代码打补丁）

* 官方缺陷**不 monkey-patch**、不改 `~/.dsh-launcher-panel/package` 里的安装产物；
* 我们自己的影响面已收敛：归档插件那三项启动扫描**不再在 `apply` 里与官方抢同一次全量扫盘**，
  改为「首次打开归档面板时补跑 + 30 s 延迟兜底」（见 `plugins/dsh-archive-manage/src/host.ts`
  的 `STARTUP_SCAN_DELAY_MS` 与 `runStartupScans`）；
* 用户侧的可感知症状（列表空一阵）随不合规日志被清理而消失；
  但**根因在上游，仍会随不合规日志重新累积而复发** —— 故本文件留档并建议上报。

## 6. 复核方式（可复现）

```powershell
# 数每个会话文件里有几个 zstd 帧（>1 表示"分帧"；=1 表示"整文件一帧"，会被完整读取）
$magic = [byte[]](0x28,0xB5,0x2F,0xFD)
Get-ChildItem "$env:USERPROFILE\.dsh\sessions" -Recurse -Filter '*.zstd' | ForEach-Object {
  $b = [System.IO.File]::ReadAllBytes($_.FullName)
  $n = 0
  for ($i = 0; $i -le $b.Length - 4; $i++) {
    if ($b[$i] -eq $magic[0] -and $b[$i+1] -eq $magic[1] -and $b[$i+2] -eq $magic[2] -and $b[$i+3] -eq $magic[3]) { $n++ }
  }
  "{0,8:N1} MiB  frames={1,5}  {2}" -f ($b.Length/1MB), $n, $_.Name
}
```
