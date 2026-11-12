/**
 * Note-skill selection for the notebook page.
 *
 * The notebook never injects a skill into a session: it lists the skills the host already exposes
 * and names one in the prefilled drafting prompt, so the agent loads it from its own catalog on
 * demand. Detection is a pure name/description heuristic; skills that do not read as note-oriented
 * stay selectable in the "other skills" group.
 */

import type { NotebookSkill } from '../../notebook-contract.js'

/** Minimal shape of one catalog summary; the registry's full type stays outside this module. */
export interface SkillSummaryLike {
  readonly name: string
  readonly description: string
  readonly source: string
  readonly invocation?: { readonly modelInvocable: boolean }
}

/** Name/description markers that read as note-writing skills. */
const NOTE_SKILL_PATTERN = /(?:^|[-_ ])note|notes?\b|笔记|markdown|obsidian|notion|zettel|journal|日记/iu

/**
 * Whether one skill looks note-oriented (used only to sort and to label the recommendation).
 * @param name - kebab-case skill name.
 * @param description - routing description from the catalog.
 * @returns whether the skill reads as a note-writing skill.
 */
export function isNoteSkill(name: string, description: string): boolean {
  return NOTE_SKILL_PATTERN.test(name) || NOTE_SKILL_PATTERN.test(description)
}

/**
 * Map catalog summaries to page skills: note-oriented first, then by name.
 * @param summaries - model-invocable skills from the host catalog.
 * @returns the page's skill list.
 */
export function toNotebookSkills(summaries: readonly SkillSummaryLike[]): NotebookSkill[] {
  return summaries
    .map(summary => ({
      name: summary.name,
      description: summary.description,
      source: summary.source,
      note: isNoteSkill(summary.name, summary.description),
    }))
    .sort((left, right) => (Number(right.note) - Number(left.note)) || left.name.localeCompare(right.name))
}

/**
 * Effective drafting skill: an explicit stored choice wins (including `null` = none); when nothing
 * was chosen yet, note2md is recommended when the catalog provides it.
 * @param skills - the page's skill list.
 * @param stored - the persisted selection (`undefined` = never chosen).
 * @returns the skill name in effect, or null for "no skill".
 */
export function resolveSkillName(skills: readonly NotebookSkill[], stored: string | null | undefined): string | null {
  if (stored !== undefined) return stored
  return skills.some(skill => skill.name === 'note2md') ? 'note2md' : null
}
