

import { createHash } from 'node:crypto'
import { readFile, realpath, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { NOTEBOOK_MAX_BYTES } from '../../constants.js'
import { DeskError } from '../http.js'
import type { DeskStore } from '../store.js'
import { normalizeRelativePath } from './library.js'


function isWithin(rootReal: string, absoluteFile: string): boolean {
  return absoluteFile === rootReal
    || absoluteFile.startsWith(`${rootReal}/`)
    || absoluteFile.startsWith(`${rootReal}\\`)
}


async function resolveContainedFile(rootPath: string, relativePath: string): Promise<string> {
  let rootReal: string
  let fileReal: string
  try {
    rootReal = await realpath(rootPath)
    fileReal = await realpath(join(rootPath, ...relativePath.split('/')))
  } catch {
    throw new DeskError('UNKNOWN_NOTE', '文件不存在或不可访问', 404)
  }
  if (!isWithin(rootReal, fileReal)) throw new DeskError('FORBIDDEN', '文件必须位于笔记库内', 403)
  return fileReal
}


async function fileHash(absolute: string): Promise<string> {
  const info = await stat(absolute)
  if (info.size > NOTEBOOK_MAX_BYTES) throw new DeskError('BAD_BODY', '文件过大', 400)
  const bytes = await readFile(absolute)
  return createHash('sha256').update(bytes).digest('hex')
}


export async function ensureNoteFile(store: DeskStore, rootPath: string, relativePath: string) {
  const path = normalizeRelativePath(relativePath)
  const absolute = await resolveContainedFile(rootPath, path)
  const hash = await fileHash(absolute)
  return await store.ensureNoteFile({ rootPath, path, hash })
}
