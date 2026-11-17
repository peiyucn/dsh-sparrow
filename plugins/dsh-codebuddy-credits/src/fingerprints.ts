


const CGJ = '\u034F'

const LEGACY_ZWSP = '\u200B'


export const NEUTRALIZER_MARKERS: readonly string[] = [CGJ, '\u180B', '\u180D']


const INSERTED_MARKERS: readonly string[] = [LEGACY_ZWSP, ...NEUTRALIZER_MARKERS]


const NEUTRALIZE_PREFIXES: readonly RegExp[] = [

  /^(\s*You)(?= are an AI agent\b)/gmu,

  /^(\s*You)(?= are interacting with the user through\b)/gmu,

  /^(\s*The)(?= runtime context\b)/gmu,

  /^(\s*Current)(?= DeepSeek Harness\b)/gmu,

  /^(\s*Main)(?= branch \(you will usually use this for PRs\))/gmu,
]


const NEUTRALIZE_TOKENS: readonly RegExp[] = [
  /(\bDeep)(?=Seek\b)/gu,
  /(\bHarness)(?=\b)/gu,
  /(\bClaude)(?= Code\b)/gu,
  /(\bAnthropic)(?='s official CLI\b)/gu,



  /(@)/gu,
]


function stripInserted(text: string): string {
  let result = text
  for (const marker of INSERTED_MARKERS) result = result.split(marker).join('')
  return result
}


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


function neutralizeProse(text: string, marker: string): string {


  let result = stripInserted(text)
  for (const pattern of NEUTRALIZE_PREFIXES) {
    result = result.replace(pattern, `$1${marker}`)
  }
  for (const pattern of NEUTRALIZE_TOKENS) {
    result = result.replace(pattern, `$1${marker}`)
  }
  return result
}


export function neutralizeChannelFingerprints(text: string): string {
  return transformProse(text, part => neutralizeProse(part, CGJ))
}


export function neutralizeWithMarker(marker: string): (text: string) => string {
  return text => transformProse(text, part => neutralizeProse(part, marker))
}


const DROP_LINE_PATTERNS: readonly RegExp[] = [
  /^\s*You are an AI agent powered by\b/u,
  /^\s*You are interacting with the user through\b/u,
  /^\s*The runtime context names the DeepSeek Harness\b/u,
  /^\s*Current DeepSeek Harness implementation checkout\b/u,
  /^\s*Main branch \(you will usually use this for PRs\)/u,
  /Claude Code, Anthropic's official CLI/u,
]


const BRAND_REWRITES: readonly (readonly [RegExp, string])[] = [
  [/DeepSeek Harness/gu, 'the host runtime'],
  [/Claude Code/gu, 'the coding CLI'],
  [/Anthropic's official CLI for Claude/gu, 'the official CLI'],
]


function stripProse(part: string): string {
  const kept: string[] = []
  for (const raw of part.split('\n')) {

    const line = stripInserted(raw)
    if (line.includes('@') || DROP_LINE_PATTERNS.some(pattern => pattern.test(line))) continue
    let next = line
    for (const [pattern, replacement] of BRAND_REWRITES) next = next.replace(pattern, replacement)
    kept.push(next)
  }
  return kept.join('\n')
}


export function stripChannelFingerprints(text: string): string {
  return transformProse(text, stripProse)
}


export function visibleText(text: string): string {
  return stripInserted(text)
}
