/**
 * Review target resolution: turn (cwd, relative path) into the snapshot a review
 * record stores — title, render kind, content fingerprint — and refuse anything the
 * AI could not edit or that is not plain text.
 */

import { createHash } from 'node:crypto'
import { readFile, realpath, stat } from 'node:fs/promises'
import { basename, isAbsolute, join } from 'node:path'
import type { ReviewTarget } from '../../contract.js'
import { MAX_REVIEW_FILE_BYTES } from '../../constants.js'
import { DeskError } from '../http.js'
import { parseFrontmatter } from './frontmatter.js'
import { normalizeLibraryPath } from './library.js'

/** Markdown suffixes rendered as markdown; everything else textual is rendered as text. */
const MARKDOWN_SUFFIX = /\.(?:md|markdown)$/iu
/** How much of the head is checked for binary markers. */
const BINARY_PROBE_BYTES = 8_192
/** Title fallback cap so a long file name cannot explode a record. */
const MAX_TITLE_CHARS = 200

/** Whether a byte sample reads as plain text (no NUL bytes). */
function looksTextual(head: Buffer): boolean {
  return !head.includes(0)
}

/** Display title: markdown frontmatter title, else the file stem. */
function titleOf(raw: string, relativePath: string, markdown: boolean): string {
  const fallback = basename(relativePath).replace(/\.[^.]+$/u, '').slice(0, MAX_TITLE_CHARS)
  if (!markdown) return fallback
  const parsed = parseFrontmatter(raw, Buffer.byteLength(raw))
  return (parsed.title ?? fallback).slice(0, MAX_TITLE_CHARS)
}

/**
 * Resolve and validate one review target.
 * @param input - absolute workspace root and a workspace-relative file path.
 * @returns the snapshot stored on the review record.
 * @throws DeskError when the path escapes the workspace, is missing, binary, or too large.
 */
export async function resolveReviewTarget(input: {
  readonly cwd: string
  readonly path: string
}): Promise<ReviewTarget> {
  if (!isAbsolute(input.cwd)) throw new DeskError('BAD_BODY', '工作区目录必须是绝对路径')
  const relative = normalizeLibraryPath(input.path)
  const absolute = join(input.cwd, ...relative.split('/'))
  let root: string
  let file: string
  try {
    root = await realpath(input.cwd)
    file = await realpath(absolute)
  } catch {
    throw new DeskError('UNKNOWN_REVIEW_TARGET', '文件不存在或不可访问', 404)
  }
  const within = file === root || file.startsWith(`${root}/`) || file.startsWith(`${root}\\`)
  if (!within) throw new DeskError('FORBIDDEN', '审阅目标必须位于工作区之内', 403)
  const info = await stat(file)
  if (!info.isFile()) throw new DeskError('BAD_BODY', '审阅目标必须是文件')
  if (info.size > MAX_REVIEW_FILE_BYTES) throw new DeskError('BAD_BODY', '文件过大，暂不支持审阅', 400)
  const bytes = await readFile(file)
  if (!looksTextual(bytes.subarray(0, BINARY_PROBE_BYTES))) {
    throw new DeskError('BAD_BODY', '只能审阅纯文本文件', 400)
  }
  const markdown = MARKDOWN_SUFFIX.test(relative)
  const text = bytes.toString('utf8')
  return {
    cwd: input.cwd,
    path: relative,
    title: titleOf(text, relative, markdown),
    kind: markdown ? 'markdown' : 'text',
    hash: createHash('sha256').update(bytes).digest('hex'),
  }
}
