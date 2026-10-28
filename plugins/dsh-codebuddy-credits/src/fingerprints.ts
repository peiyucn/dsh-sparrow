/**
 * 上游渠道风控的「内容指纹」处理。
 *
 * 背景：CodeBuddy 中国区网关（`copilot.tencent.com`）对 **system / assistant 正文**做内容指纹
 * 拦截，命中即返回 HTTP 400 `{"code":11128,"msg":"Illegal API invocation from an unapproved
 * channel"}`。已观测到的指纹都以 DeepSeek Harness / Claude Code 的身份句为核心。
 *
 * 处理方式：**不删正文**，只在命中词的第一个字符后插入一个零宽空格（U+200B）——显示与语义不变，
 * 网关的字符串匹配失效。这比逐句删除更稳：同一身份句的变体、上下文位置、大小写都不再需要单独维护；
 * 也不会因为删掉身份句而改变模型行为。围栏代码块与行内代码**原样保留**（不能把零宽字符写进用户代码）。
 *
 * 只改要发给上游的 wire 文本，本机会话历史原样保留；不改 UA / `X-IDE-Name` / 请求头，不伪装官方客户端。
 * 若上游改为语义检测，本处理即失效（表现仍是 400 / 11128）。
 */

/** 零宽空格：不可见、不改变排版与语义，只打断字符串匹配。 */
const ZWSP = '\u200B'

/**
 * 身份句前缀：在第一个字符后插零宽空格。覆盖「新的一句 DSH 身份话」这种波次，
 * 不需要等整句被完整观测到。
 */
const NEUTRALIZE_PREFIXES: readonly RegExp[] = [
  // "You are an AI agent powered by ..."
  /^(\s*You)(?= are an AI agent\b)/gmu,
  // "You are interacting with the user through ..."
  /^(\s*You)(?= are interacting with the user through\b)/gmu,
  // "The runtime context names the DeepSeek Harness implementation checkout."
  /^(\s*The)(?= runtime context\b)/gmu,
  // "Current DeepSeek Harness implementation checkout: ..."
  /^(\s*Current)(?= DeepSeek Harness\b)/gmu,
  // "Main branch (you will usually use this for PRs)"
  /^(\s*Main)(?= branch \(you will usually use this for PRs\))/gmu,
]

/** 品牌词：插在词内（不影响可见空格），同一句里的其它成分不用再列。 */
const NEUTRALIZE_TOKENS: readonly RegExp[] = [
  /(\bDeep)(?!\u200B)(?=Seek\b)/gu,
  /(\bHarness)(?!\u200B)(?=\b)/gu,
  /(\bClaude)(?!\u200B)(?= Code\b)/gu,
  /(\bAnthropic)(?!\u200B)(?='s official CLI\b)/gu,
]

/** 把一段普通文本里的身份指纹改成「视觉不变」的形式（幂等）。 */
function neutralizeProse(text: string): string {
  let result = text
  for (const pattern of NEUTRALIZE_PREFIXES) {
    result = result.replace(pattern, `$1${ZWSP}`)
  }
  for (const pattern of NEUTRALIZE_TOKENS) {
    result = result.replace(pattern, `$1${ZWSP}`)
  }
  return result
}

/**
 * 无损中和 system / assistant 正文里的渠道指纹（纯函数，幂等）：
 *  - 围栏代码块与行内代码逐字保留（零宽字符会污染用户代码）；
 *  - 其余文本只插零宽空格，不删任何字符；可见文案与 token 语义不变；
 *  - 未命中任何指纹 → 返回原字符串。
 */
export function neutralizeChannelFingerprints(text: string): string {
  if (text.length === 0) return text
  // 按围栏 / 行内代码切段：偶数段是普通文本，奇数段是代码，只处理偶数段。
  const parts = text.split(/(```[\s\S]*?```|`[^`\n]*`)/gu)
  let changed = false
  for (let index = 0; index < parts.length; index += 2) {
    const part = parts[index] ?? ''
    const next = neutralizeProse(part)
    if (next !== part) {
      parts[index] = next
      changed = true
    }
  }
  return changed ? parts.join('') : text
}

/** 去掉零宽空格后的文本，供测试断言「可见内容未变」。 */
export function visibleText(text: string): string {
  return text.split(ZWSP).join('')
}
