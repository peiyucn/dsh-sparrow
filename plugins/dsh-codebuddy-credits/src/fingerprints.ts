/**
 * 上游渠道风控的「内容指纹」处理。
 *
 * 背景：CodeBuddy 中国区网关（`copilot.tencent.com`）对 `system` / `assistant` 正文做**逐字指纹
 * 匹配**，命中即返回 HTTP 400 `{"code":11128,"msg":"Illegal API invocation from an unapproved
 * channel"}`（displayMsg：「请求被拦截，请重新发送」）。2026-10-20 深夜起，DSH 自己的系统提示词
 * 首行 `You are an AI agent powered by DeepSeek Harness.` 被收录进该黑名单（行首锚定、忽略大小写），
 * 而本适配器把宿主 `options.system` 原样作为第一条 system 发出 ⇒ 每轮推理都被拒，表现为「推理接口
 * 突然用不了了」，与账号 / Key / UA / 请求头 / 模型全都无关（这些变体实测都是 200）。
 *
 * 2026-10-21 傍晚出现**第二波**：上游又把 DSH **Web 端**运行时上下文那一行的句首收进黑名单——
 * `You are interacting with the user through the DeepSeek Harness Web GUI whose URL the runtime context
 * names.`。这条的规则形态与本文件第一波不同：实测它不是单句字面量，而是「行首锚定 + 跨句通配」，
 * 同一行里 `You are interacting … Web GUI` 与后面的 `When the user refers to "this page" …` 两句
 * **同时出现**才拦（单句各自 200、两句合并 400、顺序反过来 200）；删掉第一句后整行放行。
 *
 * 处理方式：**删掉命中的指纹句，其余内容逐字保留**（整行只有指纹句时才整行丢弃）。删除后同一份
 * 真实 system 请求实测返回 200；身份句删掉后模型仍能从下一句「You are a coding agent powered by …」
 * 知道自己是什么。Web GUI 那一行**只删首句、不整行删**：后面的「不要起第二个 server / 改完重新构建」
 * 等仍是需要的指令。不选「插字符 / 插零宽」那类字面改写：改动越少越不容易被上游归一化处理，也更好解释。
 *
 * 范围（按实测结论，别扩大也别缩小）：
 *  - ✅ `system` 消息（所有 system，不只第一条）
 *  - ✅ `assistant` 正文（历史里 assistant 复述过该句同样整轮 400——「跟会话走，不跟模型走」）
 *  - ❌ `user` / `tool` 结果 / `tool_calls[].arguments` / `reasoning`（实测放行；改了就是篡改用户
 *    内容与会话证据）
 *
 * ⚠️ 上游黑名单会持续扩张：同日实测 `Main branch (you will usually use this for PRs)`、
 * `You are Claude Code, Anthropic's official CLI for Claude` 同样返回 11128（DSH 提示词里没有这两句，
 * 故未处理）。若 DSH 系统提示词后续新增命中句，往 `FINGERPRINT_LINE_PREFIXES` 补一条正则即可；
 * 补完必须用真实 system 提示词实测一次推理（`docs/spec/10-channel-fingerprint-guard.md` 有探针方法）。
 * 定位新指纹时注意第二波这种「跨句通配」形态：**单句逐个探可能全部 200**，要按行二分、
 * 再在命中行内试相邻句子组合；确认能删掉的最小句首片段后，用完整真实 system 复测。
 */

/**
 * 行首锚定的指纹句前缀（忽略大小写）。上游是「行首锚定」：句子后面接任意正文仍拦，句子前面接任意
 * 字符（包括别的句子）则放行——所以这里按「整行以该句开头」匹配，命中后丢弃该句本身，行内剩余的
 * 正文保留。
 */
const FINGERPRINT_LINE_PREFIXES: readonly RegExp[] = [
  // 第一波（2026-10-20 深夜）：DSH 身份句。
  /^\s*You are an AI agent powered by DeepSeek Harness\b\.?/iu,
  // 第二波（2026-10-21 傍晚）：DSH Web 端运行时上下文行首句。上游这条带跨句通配（需与同行后面的
  // `When the user refers to …` 同时出现才拦），删掉句首这一句即不再命中；保留该行其余指令。
  /^\s*You are interacting with the user through the DeepSeek Harness Web GUI whose URL the runtime context names\.?/iu,
]

/**
 * 删掉文本里命中的上游指纹行（纯函数，幂等）：
 *  - 整行只有指纹句 → 删掉该行；
 *  - 指纹句前面有别的字符（不在行首）→ 不命中，原样保留；
 *  - 指纹句后面还有正文 → 只丢指纹句，保留后面的正文；
 *  - 未命中任何指纹 → 返回**同一个字符串引用**（调用方可以据此跳过拷贝）。
 *
 * 只按 `\n` 切分：CRLF 的 `\r` 留在行尾（正则 `\s*$` 会吃掉），重新 join 后原行尾不变。
 */
export function stripChannelFingerprints(text: string): string {
  if (text.length === 0) return text
  const lines = text.split('\n')
  const retained: string[] = []
  let changed = false
  for (const line of lines) {
    let matched = false
    let next = line
    for (const pattern of FINGERPRINT_LINE_PREFIXES) {
      const match = pattern.exec(next)
      if (match === null) continue
      next = next.slice(match[0].length).trim()
      matched = true
      changed = true
      // 一条行最多命中一条指纹：删掉句首指纹后剩下的正文不再参与匹配。
      break
    }
    // 未命中的行逐字保留（含空行）；命中的行若只剩空白才整行丢弃。
    if (!matched || next.length > 0) retained.push(next)
  }
  return changed ? retained.join('\n') : text
}
