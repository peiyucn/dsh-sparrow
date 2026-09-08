# 10 — 子会话标签：缓存行权威判定（免除重复全日志折叠）

> 状态：已实现（2026-09-05）。官方契约均对照本机 checkout（dsh-v0.1.2-rc.1）核实。

## 背景：spec 09 之后的残余地板

spec 09 把标题与 subagent 标签都改成「投影缓存优先、折叠兜底」，实测标题一路已完全
命中缓存（本机 16 个归档会话 0 次回落）。但 `/list` 仍有约 1s 的稳定耗时，且**每次打开
都一样慢**——与「冷启动才慢一次」的预期不符。

## 根因

10 个子会话**每个都有** projcache 行、`subagent` 行 ver 也匹配，但行的形状是：

```json
"subagent": { "ver": 2, "seq": 73366, "val": { "identity": { "mode": "one-shot", "seq": 7 } } }
```

`val.identity` **没有 `label`**。而官方 `SubagentIdentityProjection` 中 label 是
**可选**的（`projection-types.ts:28-49`：one-shot 子会话可不带，continuable 才必有）。

原第二档的判定是「取到非空 label 才算命中」：

```ts
const label = row?.values?.subagent?.label
if (typeof label === 'string' && label.trim() !== '') return label
```

于是这 10 个会话**全部掉进第三档** `observeSession`，把整份 zstd 日志解出来重折
（本机这 10 份合计约 8MB 压缩日志、seq 到 7 万+，4 路并发 ≈ 1s）。

更糟的是它不收敛：第三档只在折出标签时才写 LRU 记忆，而这批会话**永远折不出标签**
（一次折叠也只会得到同一个无 label 的 identity），`hydratePrepared` 也不回写 projcache
行 → 每次打开面板都是 10 次全日志折叠，重启 dsh 也不缓解。

## 判据修正：identity 非 null 即权威

官方 `subagent` 单元的 view 是 `state.identity ?? null`（`projection.ts:178`）：

- `null` ⟺ 没折到有效描述符（缺失 / 畸形 / 版本不识别），**未定**，仍需折叠；
- 非 `null` ⟺ 官方已在这份日志上折到描述符。描述符一经追加即不可变（官方注释
  "a descriptor is immutable once appended"）且位于子会话日志开头（实测 seq:7），
  因此**折到一次即永久成立**；其中 label 缺失 = 该会话确实没有标签，不是「还没折出来」。

所以第二档判定从「取到 label 才算命中」改为「identity 非 null 即权威结论」：

| 缓存行 identity | 结论 | 行为 |
|---|---|---|
| 带 label | 有标签 | 直接返回标签 |
| 存在但无 label | **权威无标签** | 直接返回 undefined，**不折叠** |
| `null` / 缺失 / ver 不匹配 | 未定 | 继续走折叠档（保守，不变） |

行的可靠性由官方保证，可放心当权威用：`cachedSnapshot` 先过 `identityMatches`
（createdAt / cwd / isSeeded / inheritedEventCount）确认「这份缓存属于这条生命周期」，
`viewCheckpoint` 再丢弃 `ver` 与 live unit 不一致的行
（`session-projection-cache/src/index.ts:116`、`session-projection/src/index.ts:448`）。

**不拿正确性换速度**：只有官方明确给出 identity 才停止折叠；identity 为 null
（可能是快照早于描述符写入）仍走原路。

## 附带：无标签结论也进记忆

`foldedSubagentLabels` 值域由 `string` 放宽为 `string | null`——「权威无标签」同样值得
记住，否则折叠档仍会为每个无标签会话反复解日志。非权威结果（折叠抛错、生命周期
不匹配）**不记**，下次仍可重试（保持原有容错）。LRU 上限与淘汰语义不变。

## 涉及文件

- `src/archive.ts`：`labelFromSubagentIdentity`（纯函数，`SubagentIdentityValue` 类型）。
- `src/host.ts`：`subagentLabel` 三档改走新判据；记忆值域放宽。
- `test/host.test.mjs`：新判据矩阵 + 记忆/重试语义。

## 验证

- `npm run verify` 全绿（116 tests）。
- 对照实测（本机真实 projcache，10 个子会话）：需折叠数 **10/10 → 0/10**。
- owner 重启 dsh 后实测 `/list` 打开耗时（预期从 ~1s 降到 ~100ms 级）。

## 风险

- 若官方未来给 one-shot 描述符补写 label（语义变更），缓存行里的旧无 label identity
  仍是当时的权威结论，不会自动更新——与本插件其它缓存同款「按生命周期静止」假设一致，
  且描述符不可变的性质未变，影响面仅限标签展示。
- LRU 记忆存 `null` 后，该会话在本次进程内不再重折；进程重启后记忆清空，会重新走一次
  缓存判定（仍然免折叠），故无正确性风险。
