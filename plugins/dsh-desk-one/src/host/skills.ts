/**
 * Bundled skills: note2md (library init / import / templates) and desk-review (review-loop contract).
 *
 * Skills are plain directories shipped inside the npm package. They are read at
 * runtime and registered through the official skill registry, with a directory
 * resource base so `<skill_dir>/templates` and `<skill_dir>/tools` resolve.
 *
 * The service is optional on purpose: a host without `skills` still gets the panel
 * and the tools, just without the routing document.
 */

import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { PACKAGE_NAME } from '../constants.js'

/** One skill shipped with the plugin. */
interface BundledSkill {
  readonly dir: string
  readonly name: string
  /** Fallback description when the file has no frontmatter description. */
  readonly description: string
}

/** Skills this package ships, in registration order. */
const BUNDLED_SKILLS: readonly BundledSkill[] = [
  {
    dir: 'note2md',
    name: 'note2md',
    description: 'Agent-native Markdown note management with Notebook→Section→Page hierarchy (init, new page/section, templates, OneNote import, archive, AGENTS.md manifest).',
  },
  {
    dir: 'desk-review',
    name: 'desk-review',
    description: 'Review loop for AI-written notes: annotations, anchors, statuses and the human-in-the-loop rule that only the human resolves.',
  },
]

/** The slice of the official SkillRegistry this module calls. */
interface SkillRegistryLike {
  register(skill: {
    readonly name: string
    /** Required by the 0.2.2 registry contract (SkillSummary.source). */
    readonly source: 'bundled'
    readonly description: string
    readonly content: string
    readonly resourceBase?: { readonly kind: 'directory'; readonly path: string }
  }): () => void
}

/** Parsed `SKILL.md`: frontmatter description plus the body fed to the model. */
export interface ParsedSkillFile {
  readonly description: string
  readonly content: string
}

/**
 * Split one `SKILL.md` into its description and body.
 *
 * Only the `description` frontmatter key is read; the rest of the frontmatter stays out
 * of the model-facing body, matching how filesystem providers render a skill.
 * @param raw - file text.
 * @returns the description (possibly multi-line, unwrapped) and the trimmed body.
 */
export function parseSkillFile(raw: string): ParsedSkillFile {
  const source = raw.startsWith('\uFEFF') ? raw.slice(1) : raw
  if (!source.startsWith('---')) return { description: '', content: source.trim() }
  const lines = source.split('\n')
  let end = -1
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].trimEnd() === '---') { end = index; break }
  }
  if (end < 0) return { description: '', content: source.trim() }
  const description = readDescription(lines.slice(1, end))
  return { description, content: lines.slice(end + 1).join('\n').trim() }
}

/** Opening/closing quote pair used by the description scalar. */
const QUOTES = ['"', "'"] as const

/**
 * Read the `description` value, supporting multiline quoted and plain scalars.
 * @param lines - frontmatter lines (delimiters excluded).
 * @returns the unwrapped description, or an empty string when absent.
 */
function readDescription(lines: readonly string[]): string {
  const start = lines.findIndex(line => /^description\s*:/u.test(line))
  if (start < 0) return ''
  const first = lines[start].replace(/^description\s*:\s*/u, '').trim()
  const quote = QUOTES.find(candidate => first.startsWith(candidate))
  if (quote === undefined) return first
  // A quoted scalar may span lines: gather until the closing quote; YAML folds newlines.
  const parts = [first.slice(1)]
  let index = start + 1
  while (!parts.join('\n').trimEnd().endsWith(quote) && index < lines.length) {
    parts.push(lines[index])
    index += 1
  }
  return parts.join('\n')
    .replace(/\\n/gu, ' ')
    .replace(/[ \t]*\n[ \t]*/gu, ' ')
    .trim()
    .replace(new RegExp(`${quote}$`, 'u'), '')
    .trim()
}

/** Absolute directory holding this package's `skills/`. */
function skillsRoot(): string {
  // Compiled layout: <package>/lib/host/skills.js → package root is two levels up.
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'skills')
}

/**
 * Register every bundled skill; failures are logged and skipped, never fatal.
 * @param ctx - host plugin context.
 */
export async function registerBundledSkills(ctx: Context): Promise<void> {
  const skills = ctx.get('skills') as SkillRegistryLike | undefined
  if (skills === undefined) {
    ctx.logger.warn(`${PACKAGE_NAME}: 宿主未提供 skills 服务，随包 skill 未注册`)
    return
  }
  const root = skillsRoot()
  for (const entry of BUNDLED_SKILLS) {
    const dir = join(root, entry.dir)
    try {
      const raw = await readFile(join(dir, 'SKILL.md'), 'utf8')
      const parsed = parseSkillFile(raw)
      const dispose = skills.register({
        name: entry.name,
        // SkillSummary.source is required by the 0.2.2 registry contract; bundled skills
        // report "bundled" like the official filesystem provider does.
        source: 'bundled',
        description: parsed.description === '' ? entry.description : parsed.description,
        content: parsed.content,
        resourceBase: { kind: 'directory', path: dir },
      })
      ctx.effect(() => dispose, `${PACKAGE_NAME}: skill ${entry.name}`)
    } catch (error) {
      ctx.logger.warn(`${PACKAGE_NAME}: 读取随包 skill「${entry.name}」失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
