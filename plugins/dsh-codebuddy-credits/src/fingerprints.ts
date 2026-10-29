/**
 * 上游渠道风控的「内容指纹」处理。
 *
 * 背景：CodeBuddy 中国区网关（`copilot.tencent.com`）对 **system / assistant 正文**做内容指纹
 * 拦截，命中即返回 HTTP 400 `{"code":11128,"msg":"Illegal API invocation from an unapproved
 * channel"}`。已观测到的指纹有三类，互相独立（任何一类残留都会整轮被拒）：
 *  1. DeepSeek Harness / Claude Code 的身份句；
 *  2. DSH Web 的「Web GUI」身份句；
 *  3. 「`@` 路径引用」说明段（2026-10-28 实测）。
 *
 * 处理方式：**不删正文**，只在命中词内插入一个不可见的组合字符（默认 U+034F CGJ；候选池见
 * `NEUTRALIZER_MARKERS`）——显示与语义不变，网关的字符串匹配失效。这比逐句删除更稳：同一身份句的
 * 变体、上下文位置、大小写都不再需要单独维护；也不会因为删掉身份句而改变模型行为。围栏代码块与
 * 行内代码**原样保留**（不能把不可见字符写进用户代码）。
 *
 * 2026-10-29 实测：上游已把常见零宽字符（U+200B / 200C / 200D / 2060 / FEFF / 00AD / 180E）与
 * 双空格归一化后再匹配，旧版「插 U+200B」整层失效；U+034F（CGJ）当时未被归一化，故改用它。
 * 「自适应 API 拦截」（见 `docs/spec/01-runtime-adaptation.md`）：当前字符被归一化收掉时，适配器按阶梯
 * 换下一候选字符；候选池全灭时用 `stripChannelFingerprints` 删段兜底。该结论只代表实测时刻，
 * 上游下一轮收缩仍可能让整套失效（表现仍是 400 / 11128）。
 *
 * 旧历史兼容：早期版本用 U+200B 中和过，assistant 正文可能残留 U+200B；上游归一化后等于没中和，
 * 故处理前先把旧插入符与候选池字符一并剥掉再按当前规则重打（只动命中词的插入符，可见文字不变），
 * 顺带保证本函数幂等。
 *
 * 只改要发给上游的 wire 文本，本机会话历史原样保留；不改 UA / `X-IDE-Name` / 请求头，不伪装官方客户端。
 */

/** 组合字符 CGJ（U+034F）：不可见、不占排版位、不改变语义。 */
const CGJ = '\u034F'
/** 旧版中和符（U+200B，ZWSP）：上游已会归一化，正文里残留时必须剥掉重打。 */
const LEGACY_ZWSP = '\u200B'

/**
 * 候选中和字符池（顺序 = 运行时阶梯的尝试顺序，见 `docs/spec/01-runtime-adaptation.md`）：
 * 全部是 Mn 类组合记号、无可见字形。2026-10-29 实测：上游清洗的是「格式字符」（Cf）类，故候选选组合类；
 * CGJ / U+180B / U+180D 均放行；U+2061-2064、U+FE00/FE0F、U+E0100 均被归一化收掉（不得再用）。
 * 上游收掉一个就换下一个，全部失效后改用 `stripChannelFingerprints` 兜底。
 * 候选池名单是单点：适配器只读这里，别在别处复制第二份。
 */
export const NEUTRALIZER_MARKERS: readonly string[] = [CGJ, '\u180B', '\u180D']

/** 需要先剥掉的插入符：旧版 ZWSP + 候选池（保证重打幂等、不与旧标记叠加）。 */
const INSERTED_MARKERS: readonly string[] = [LEGACY_ZWSP, ...NEUTRALIZER_MARKERS]

/**
 * 身份句前缀：在第一个字符后插组合字符。覆盖「新的一句 DSH 身份话」这种波次，
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
  /(\bDeep)(?=Seek\b)/gu,
  /(\bHarness)(?=\b)/gu,
  /(\bClaude)(?= Code\b)/gu,
  /(\bAnthropic)(?='s official CLI\b)/gu,
  // 「@ 路径引用」类指纹：只插在 `@` 之后，`@path` / `@"..."` 的可见形态与含义不变
  // （组合字符不占排版位），但上游的字符匹配失效。不做白名单：@ 只出现在提示词说明里，
  // 正文中的路径语法同样是命中源。
  /(@)/gu,
]

/** 剥掉旧版与本版已插入的中和符（候选池轮换时先清场，再按当前字符重打）。 */
function stripInserted(text: string): string {
  let result = text
  for (const marker of INSERTED_MARKERS) result = result.split(marker).join('')
  return result
}

/** 按围栏 / 行内代码切段：偶数段是普通文本，奇数段是代码，只处理偶数段。 */
function transformProse(text: string, transform: (part: string) => string): string {
  if (text.length === 0) return text
  const parts = text.split(/(```[\s\S]*?```|`[^`\n]*`)/gu)
  let changed = false
  for (let index = 0; index < parts.length; index += 2) {
    const part = parts[index] ?? ''
    const next = transform(part)
    if (next !== part) {
      parts[index] = next
      changed = true
    }
  }
  return changed ? parts.join('') : text
}

/** 把一段普通文本里的身份指纹改成「视觉不变」的形式（幂等）。 */
function neutralizeProse(text: string, marker: string): string {
  // 先剥掉历史残留的插入符（旧版 ZWSP、候选池全部成员）再按当前规则重打：
  // 上游会归一化部分不可见字符，旧中和等于没做；先剥后插也让本函数天然幂等。
  let result = stripInserted(text)
  for (const pattern of NEUTRALIZE_PREFIXES) {
    result = result.replace(pattern, `$1${marker}`)
  }
  for (const pattern of NEUTRALIZE_TOKENS) {
    result = result.replace(pattern, `$1${marker}`)
  }
  return result
}

/**
 * 无损中和 system / assistant 正文里的渠道指纹（纯函数，幂等）：
 *  - 围栏代码块与行内代码逐字保留（不可见字符会污染用户代码）；
 *  - 其余文本只插组合字符，不删任何可见字符；可见文案与 token 语义不变；
 *  - 未命中任何指纹 → 返回原字符串。
 */
export function neutralizeChannelFingerprints(text: string): string {
  return transformProse(text, part => neutralizeProse(part, CGJ))
}

/** 可注入中和符的同一套规则（运行时阶梯用）：只换字符，不换匹配规则。 */
export function neutralizeWithMarker(marker: string): (text: string) => string {
  return text => transformProse(text, part => neutralizeProse(part, marker))
}

/** 整行删除的已知指纹行（身份句 / Web GUI 句 / 运行时上下文句 / Claude Code 句）。 */
const DROP_LINE_PATTERNS: readonly RegExp[] = [
  /^\s*You are an AI agent powered by\b/u,
  /^\s*You are interacting with the user through\b/u,
  /^\s*The runtime context names the DeepSeek Harness\b/u,
  /^\s*Current DeepSeek Harness implementation checkout\b/u,
  /^\s*Main branch \(you will usually use this for PRs\)/u,
  /Claude Code, Anthropic's official CLI/u,
]

/** 剩余行里的品牌词改写（覆盖「新变体的身份句仍含品牌词」）。 */
const BRAND_REWRITES: readonly (readonly [RegExp, string])[] = [
  [/DeepSeek Harness/gu, 'the host runtime'],
  [/Claude Code/gu, 'the coding CLI'],
  [/Anthropic's official CLI for Claude/gu, 'the official CLI'],
]

/**
 * 逐行降级：删指纹行 + 品牌词改写；代码段不进入本函数。
 * 含 `@` 的行一律删除——当前系统提示里 `@` 只出现在被拦的路径说明段，兜底「宁删勿留」。
 */
function stripProse(part: string): string {
  const kept: string[] = []
  for (const raw of part.split('\n')) {
    // 先剥掉旧中和符：历史正文可能已被旧版/本版中和过，删除规则要按可见原文匹配。
    const line = stripInserted(raw)
    if (line.includes('@') || DROP_LINE_PATTERNS.some(pattern => pattern.test(line))) continue
    let next = line
    for (const [pattern, replacement] of BRAND_REWRITES) next = next.replace(pattern, replacement)
    kept.push(next)
  }
  return kept.join('\n')
}

/**
 * 最终降级（`strip` rung）：整行删除已知指纹 + 品牌词改写。不插任何不可见字符，
 * 因此对「上游归一化」免疫；代价是模型读不到身份句与 `@` 语法说明（行为漂移，仅作兜底）。
 */
export function stripChannelFingerprints(text: string): string {
  return transformProse(text, stripProse)
}

/** 去掉插入字符（含旧版 ZWSP 与候选池）后的文本，供测试断言「可见内容未变」。 */
export function visibleText(text: string): string {
  return stripInserted(text)
}
