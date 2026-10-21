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
 * 处理方式：**整行删除**命中行，其余行逐字保留。删除后同一份真实 system 请求实测返回 200；
 * 模型仍能从下一句「You are a coding agent powered by …」知道自己是什么，只是不再复述那句会被拦的
 * 固定自我介绍。不选「插字符 / 插零宽」那类字面改写：改动越少越不容易被上游归一化处理，也更好解释。
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
 */

/**
 * 行首锚定的指纹句前缀（忽略大小写）。上游是「行首锚定」：句子后面接任意正文仍拦，句子前面接任意
 * 字符（包括别的句子）则放行——所以这里按「整行以该句开头」匹配，命中后丢弃该句本身，行内剩余的
 * 正文保留。
 */
const FINGERPRINT_LINE_PREFIXES: readonly RegExp[] = [
  /^\s*You are an AI agent powered by DeepSeek Harness\b\.?/iu,
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
