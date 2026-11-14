/** Notebook file helpers: content hashing and lazily assigned file identity. */

import { createHash } from 'node:crypto'
import { readFile, realpath, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { NOTEBOOK_MAX_BYTES } from '../../constants.js'
import { DeskError } from '../http.js'
import type { DeskStore } from '../store.js'
import { normalizeRelativePath } from './library.js'

/** Whether one resolved absolute path stays inside the resolved library root. */
function isWithin(rootReal: string, absoluteFile: string): boolean {
  return absoluteFile === rootReal
    || absoluteFile.startsWith(`${rootReal}/`)
    || absoluteFile.startsWith(`${rootReal}\\`)
}

/**
 * Resolve one library file for identity/hash work, refusing anything that escapes the root through
 * `..` or a symbolic link. Mirrors `readPage`'s safety check so file identity cannot be assigned to
 * (or hashed from) a file outside the library.
 * @param rootPath - absolute library root.
 * @param relativePath - already normalized relative path.
 * @returns the resolved absolute file path.
 * @throws DeskError with `readPage`'s existing semantics (404 missing, 403 outside the root).
 */
async function resolveContainedFile(rootPath: string, relativePath: string): Promise<string> {
  let rootReal: string
  let fileReal: string
  try {
    rootReal = await realpath(rootPath)
    fileReal = await realpath(join(rootPath, ...relativePath.split('/')))
  } catch {
    throw new DeskError('UNKNOWN_NOTE', '文件不存在或不可访问', 404)
  }
  if (!isWithin(rootReal, fileReal)) throw new DeskError('FORBIDDEN', '文件必须位于工作区内', 403)
  return fileReal
}

/** sha256 of one file's bytes (bounded read). */
async function fileHash(absolute: string): Promise<string> {
  const info = await stat(absolute)
  if (info.size > NOTEBOOK_MAX_BYTES) throw new DeskError('BAD_BODY', '文件过大', 400)
  const bytes = await readFile(absolute)
  return createHash('sha256').update(bytes).digest('hex')
}

/**
 * Resolve (or lazily assign) the identity of one workspace file.
 * @param store - unified store.
 * @param rootPath - absolute workspace root.
 * @param relativePath - caller-supplied relative path.
 * @returns the file identity with a fresh content hash.
 */
export async function ensureNoteFile(store: DeskStore, rootPath: string, relativePath: string) {
  const path = normalizeRelativePath(relativePath)
  const absolute = await resolveContainedFile(rootPath, path)
  const hash = await fileHash(absolute)
  return await store.ensureNoteFile({ rootPath, path, hash })
}
