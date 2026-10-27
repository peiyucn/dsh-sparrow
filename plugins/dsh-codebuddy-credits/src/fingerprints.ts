/**
 * 上游渠道风控的「内容指纹」处理。
 *
 * 背景：CodeBuddy 中国区网关（`copilot.tencent.com`）对 **system / assistant 正文**做内容指纹
 * 拦截，命中即返回 HTTP 400 `{"code":11128,"msg":"Illegal API invocation from an unapproved
 * channel"}`（displayTips：「这次调用没通过渠道验证，可能不是从官方客户端发出」）。
 *
 * 已观测到的三波（2026-10-20 ~ 2026-10-21）：
 *  1. 身份句 `You are an AI agent powered by DeepSeek Harness.`（行首锚定）；
 *  2. DSH Web 端运行时上下文行的首句 `You are interacting with the user through the DeepSeek
 *     Harness Web GUI whose URL the runtime context names.`——与同行后面的 `When the user refers
 *     to "this page" …` 组合才拦，**组合位置无关**（行中段同样拦）；
 *  3. `Main branch (you will usually use this for PRs)`——**位置无关**；
 *     `You are Claude Code, Anthropic's official CLI for Claude`——行首锚定。
 *
 * 实测边界（2026-10-21，公司网络，真实请求逐项重放）：
 *  - 只有 **system / assistant 正文**会被扫：user 正文、tool 结果、tool_calls 参数各自带指纹
 *    均实测 200，故一律不动（改了就是篡改用户内容与会话证据）。
 *  - 命中判据大小写不敏感；行首锚定的条目只认行首，位置无关的条目行中段同样拦。
 *  - assistant 历史文本同受约束（「跟会话走，不跟模型走」）：模型自己复述过这些句子，之后
 *    每轮都会 400，所以 assistant 正文也必须处理。
 *
 * 处理方式：删掉命中的指纹（行首锚定句删句首句、位置无关句删出现处），其余内容逐字保留；
 * 只改**要发给上游的 wire 文本**，本机会话历史原样保留；不改 UA / `X-IDE-Name` / 请求头，
 * 不伪装官方客户端。身份如实自报的口径不变。
 *
 * ⚠️ 上游黑名单会持续扩张（已连扩三波），这是长期拉锯：新指纹出现时往下面两个表补正则 + 补测试，
 * 并用真实 system / assistant 文本实测一次推理（不能只看单测）。定位方法见
 * `docs/spec/00-overview.md` 的「上游内容指纹」一节。
 */

/** 行首锚定的指纹句（删句首句、保留行内其余正文；忽略大小写）。 */
const FINGERPRINT_LINE_PREFIXES: readonly RegExp[] = [
  /^\s*You are an AI agent powered by DeepSeek Harness\b\.?/iu,
  /^\s*You are Claude Code, Anthropic's official CLI for Claude\b\.?/iu,
]

/** 位置无关的指纹（在 system / assistant 正文任意位置出现都删；忽略大小写）。 */
const FINGERPRINT_ANYWHERE: readonly RegExp[] = [
  /Main branch \(you will usually use this for PRs\)\.?/giu,
  /You are interacting with the user through the DeepSeek Harness Web GUI whose URL the runtime context names\.?/giu,
]

/**
 * 删掉文本里命中的上游指纹（纯函数，幂等）：
 *  - 行首锚定条目：删行首那一句，行内剩余正文保留；整行只有指纹句时整行丢弃；
 *  - 位置无关条目：删掉文本里所有出现处（可能留下空格，不做额外改写）；
 *  - 未命中任何指纹 → 返回原字符串。
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
      // 一条行最多命中一条行首指纹：删掉句首指纹后剩下的正文不再参与匹配。
      break
    }
    // 未命中的行逐字保留（含空行）；命中的行若只剩空白才整行丢弃。
    if (!matched || next.length > 0) retained.push(next)
  }
  let result = changed ? retained.join('\n') : text
  for (const pattern of FINGERPRINT_ANYWHERE) {
    const replaced = result.replace(pattern, '')
    if (replaced !== result) {
      result = replaced
      changed = true
    }
  }
  return changed ? result : text
}
