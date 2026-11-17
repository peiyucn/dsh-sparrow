import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { checkNoComments } from '../meta/lint/check-comments.mjs'
import { activePluginNames } from './plugin-set.mjs'

const E24_JOBS = new Set(['typecheck', 'test', 'build', 'package', 'publish', 'deploy', 'sync'])
const ROOT_DOCS = ['AGENTS.md', 'README.md', 'README.zh-CN.md', 'SECURITY.md', 'docs/brand.md', 'docs/private-seams.md']
const PLUGIN_DOCS = ['README.md', 'README.zh-CN.md', 'CHANGELOG.md', 'CHANGELOG.zh-CN.md', 'cordis.patch.yml']
const PLUGIN_PACKAGE_FILES = ['lib/**/*.js', 'cordis.patch.yml', 'README.md', 'README.zh-CN.md', 'CHANGELOG.md', 'CHANGELOG.zh-CN.md']
const GITIGNORE_ENTRIES = ['node_modules/', 'lib/', '*.tgz', 'junit.xml', '.release-notes/']
const PUBLISH_ENVIRONMENT = 'npm-publish'

function read(root, file) {
  return readFileSync(join(root, file), 'utf8').replace(/\r\n/g, '\n')
}

function text(file) {
  return readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
}

function exists(root, file) {
  return existsSync(join(root, file))
}

function parseJobs(workflow) {
  const jobsAt = workflow.search(/^jobs:\s*$/m)
  if (jobsAt === -1) return []
  const jobs = []
  for (const line of workflow.slice(jobsAt).split('\n').slice(1)) {
    if (/^\S/.test(line) && !line.startsWith('  ')) break
    const match = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line)
    if (match) jobs.push(match[1])
  }
  return jobs
}

function firstVersion(markdown) {
  const match = /^## \[([^\]]+)\]/m.exec(markdown)
  return match ? match[1] : undefined
}

function headingKeys(markdown, heading) {
  const lines = markdown.split('\n')
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`)
  if (start === -1) return []
  const keys = []
  let inTable = false
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) break
    if (/^\|\s*(Key|键)\s*\|/iu.test(line)) {
      inTable = true
      continue
    }
    if (!inTable) continue
    const match = /^\|\s*([A-Za-z_$][\w$]*)\s*\|/u.exec(line)
    if (match) keys.push(match[1])
  }
  return keys
}

function schemaKeys(source) {
  const start = source.indexOf('export const Config = z.object({')
  if (start === -1) return []
  const body = source.slice(start).split('\n').slice(1)
  const keys = []
  for (const line of body) {
    if (/^\}\)/u.test(line)) break
    const match = /^\s{2}([A-Za-z_$][\w$]*):\s*z\./u.exec(line)
    if (match) keys.push(match[1])
  }
  return keys
}

function engineMajor(range) {
  if (typeof range !== 'string') return undefined
  const match = /\d+/u.exec(range)
  return match ? Number(match[0]) : undefined
}

function workflowJobs(root, file) {
  if (!exists(root, file)) return null
  return parseJobs(read(root, file))
}

function registeredPipeline(root) {
  const file = 'meta/rules/engineering.md'
  if (!exists(root, file)) return null
  const line = read(root, file).split('\n').find((entry) => entry.startsWith('| dsh-sparrow |'))
  if (!line) return null
  const columns = line.split('|').map((column) => column.trim())
  return {
    dev: columns[2],
    ci: columns[3],
    publish: columns[4],
    deploy: columns[5],
  }
}

function stagedJobs(cell) {
  return [...cell.matchAll(/`([^`]+)`/gu)].map((match) => match[1])
}

function walkFiles(dir) {
  const files = []
  if (!existsSync(dir)) return files
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...walkFiles(full))
    else if (entry.isFile()) files.push(full)
  }
  return files
}

export function checkRepository(root) {
  const violations = []
  const fail = (id, message) => violations.push(`${id} ${message}`)
  const plugins = existsSync(join(root, 'plugins')) ? activePluginNames(root) : []

  if (plugins.length === 0) fail('QG001', 'plugins/ has no active plugin')

  for (const file of ROOT_DOCS) {
    if (!exists(root, file)) fail('QG001', `missing required document: ${file}`)
  }

  for (const name of plugins) {
    for (const file of PLUGIN_DOCS) {
      const rel = `plugins/${name}/${file}`
      if (!exists(root, rel)) fail('QG001', `missing required document: ${rel}`)
    }
    const specDir = join(root, 'plugins', name, 'docs', 'spec')
    const specs = walkFiles(specDir).filter((file) => file.endsWith('.md'))
    if (specs.length === 0) fail('QG001', `missing plugin spec document: plugins/${name}/docs/spec/*.md`)
  }

  const schemaPlugins = plugins.filter((name) => exists(root, `plugins/${name}/src/settings-schema.ts`))
  if (schemaPlugins.length === 0) fail('QG002', 'no plugin declares src/settings-schema.ts with a Config schema')
  for (const name of schemaPlugins) {
    const keys = schemaKeys(read(root, `plugins/${name}/src/settings-schema.ts`))
    if (keys.length === 0) {
      fail('QG002', `plugins/${name}/src/settings-schema.ts has no Config keys`)
      continue
    }
    for (const [file, heading] of [['README.md', 'Settings'], ['README.zh-CN.md', '设置']]) {
      const rel = `plugins/${name}/${file}`
      if (!exists(root, rel)) continue
      const documented = headingKeys(read(root, rel), heading)
      if (JSON.stringify(documented) !== JSON.stringify(keys)) {
        fail('QG002', `${rel} settings table must list ${keys.join(', ')} in schema order`)
      }
    }
  }

  if (!exists(root, 'package.json')) {
    fail('QG003', 'missing package.json')
  } else {
    const pkg = JSON.parse(read(root, 'package.json'))
    const engine = pkg.engines?.node
    const major = engineMajor(engine)
    if (major === undefined) fail('QG003', 'package.json engines.node must declare a Node major')
    for (const name of plugins) {
      const pluginPkg = JSON.parse(read(root, `plugins/${name}/package.json`))
      if (pluginPkg.engines?.node !== engine) {
        fail('QG003', `plugins/${name}/package.json engines.node must equal root engines.node (${engine})`)
      }
      const typesMajor = engineMajor(pluginPkg.devDependencies?.['@types/node'])
      if (typesMajor === undefined || typesMajor !== major) {
        fail('QG003', `plugins/${name}/package.json @types/node must match Node ${major}`)
      }
    }
    if (exists(root, '.github/workflows/ci.yml')) {
      const ci = read(root, '.github/workflows/ci.yml')
      for (const match of ci.matchAll(/node-version:\s*"?(\d+)/gu)) {
        if (Number(match[1]) !== major) fail('QG003', `ci.yml node-version ${match[1]} must equal Node ${major}`)
      }
    }
  }

  const bilingual = [['README.md', 'README.zh-CN.md']]
  for (const name of plugins) {
    bilingual.push(
      [`plugins/${name}/README.md`, `plugins/${name}/README.zh-CN.md`],
      [`plugins/${name}/CHANGELOG.md`, `plugins/${name}/CHANGELOG.zh-CN.md`],
    )
  }
  for (const [left, right] of bilingual) {
    const leftName = left.split('/').pop()
    const rightName = right.split('/').pop()
    for (const [file, marker] of [[left, rightName], [right, leftName]]) {
      if (!exists(root, file)) continue
      if (!read(root, file).includes(marker)) fail('QG004', `${file} must link to ${marker}`)
    }
  }

  for (const name of plugins) {
    const pkg = JSON.parse(read(root, `plugins/${name}/package.json`))
    for (const file of ['CHANGELOG.md', 'CHANGELOG.zh-CN.md']) {
      const rel = `plugins/${name}/${file}`
      if (!exists(root, rel)) continue
      if (firstVersion(read(root, rel)) !== pkg.version) {
        fail('QG005', `${rel} latest version must be ${pkg.version}`)
      }
    }
  }

  if (!exists(root, 'package.json')) {
    fail('QG006', 'missing package.json')
  } else {
    const pkg = JSON.parse(read(root, 'package.json'))
    const scripts = pkg.scripts ?? {}
    if (typeof scripts.verify !== 'string' || !/^npm run lint(?:\s|$)/u.test(scripts.verify.trim())) {
      fail('QG006', 'package.json scripts.verify must start with "npm run lint"')
    }
    const lint = typeof scripts.lint === 'string' ? scripts.lint : ''
    const codeAt = lint.indexOf('npm run lint:code')
    const policyAt = lint.indexOf('npm run lint:policy')
    if (codeAt === -1 || policyAt === -1 || codeAt > policyAt) {
      fail('QG006', 'package.json scripts.lint must run "npm run lint:code" before "npm run lint:policy"')
    }
  }

  const pipeline = registeredPipeline(root)
  if (pipeline === null) {
    fail('QG007', 'meta/rules/engineering.md has no dsh-sparrow pipeline row')
  } else {
    const expected = stagedJobs(pipeline.ci)
    const jobs = workflowJobs(root, '.github/workflows/ci.yml')
    if (jobs === null) {
      fail('QG007', '.github/workflows/ci.yml is missing')
    } else {
      const unknown = jobs.filter((job) => !E24_JOBS.has(job))
      if (unknown.length > 0) fail('QG007', `ci.yml has unknown job name(s): ${unknown.join(', ')}`)
      if (new Set(jobs).size !== jobs.length) fail('QG007', 'ci.yml has duplicate job names')
      if (jobs.join(',') !== expected.join(',')) {
        fail('QG007', `ci.yml jobs must follow the registered pipeline (${expected.join(' → ')}); found ${jobs.join(' → ') || '(none)'}`)
      }
    }
    if (pipeline.publish !== '—') {
      const publishJobs = workflowJobs(root, '.github/workflows/publish.yml')
      if (publishJobs === null || !publishJobs.includes('publish')) {
        fail('QG007', 'registered publish stage must exist in .github/workflows/publish.yml')
      }
    }
    if (pipeline.deploy !== '—') {
      const marketJobs = workflowJobs(root, '.github/workflows/market.yml')
      if (marketJobs === null || !marketJobs.includes('deploy')) {
        fail('QG007', 'registered deploy stage must exist in .github/workflows/market.yml')
      }
    }
  }

  const publishPath = '.github/workflows/publish.yml'
  if (!exists(root, publishPath)) {
    fail('QG008', `${publishPath} is missing`)
  } else {
    const publish = read(root, publishPath)
    if (!publish.includes(`environment: ${PUBLISH_ENVIRONMENT}`)) {
      fail('QG008', `publish must use the ${PUBLISH_ENVIRONMENT} environment`)
    }
    const gate = publish.indexOf('Security alert gate')
    const publishAt = publish.indexOf('npm publish')
    if (gate === -1 || publishAt === -1 || gate > publishAt) {
      fail('QG008', 'security-alert gate must run before npm publish')
    }
    if (!publish.includes('SECURITY_ALERTS_TOKEN')) fail('QG008', 'publish gate must use SECURITY_ALERTS_TOKEN')
    if (!publish.includes('git merge-base --is-ancestor') || !publish.includes('origin/main')) {
      fail('QG008', 'publish must fail closed when the tag commit is not on main')
    }
  }

  if (!exists(root, '.gitignore')) {
    fail('QG009', '.gitignore is missing')
  } else {
    const ignore = read(root, '.gitignore')
    for (const entry of GITIGNORE_ENTRIES) {
      if (!ignore.split('\n').includes(entry)) fail('QG009', `.gitignore must contain ${entry}`)
    }
  }
  for (const name of plugins) {
    const pkg = JSON.parse(read(root, `plugins/${name}/package.json`))
    const files = Array.isArray(pkg.files) ? pkg.files : []
    for (const entry of files) {
      if (/^(?:test|src|scripts|docs|tsconfig|junit|\.release-notes)/u.test(entry)) {
        fail('QG009', `plugins/${name}/package.json files must not ship ${entry}`)
      }
    }
    for (const required of PLUGIN_PACKAGE_FILES) {
      if (!files.includes(required)) fail('QG009', `plugins/${name}/package.json files must contain ${required}`)
    }
  }

  const testDirs = [join(root, 'test')]
  for (const name of plugins) testDirs.push(join(root, 'plugins', name, 'test'))
  for (const dir of testDirs) {
    for (const file of walkFiles(dir)) {
      if (!file.endsWith('.test.ts')) continue
      if (/\.only\s*\(/u.test(text(file))) {
        fail('QG010', `${relative(root, file).replaceAll('\\', '/')} must not commit .only()`)
      }
    }
  }

  violations.push(...checkNoComments(root))
  return violations
}

const entry = process.argv[1]
if (entry && import.meta.url === pathToFileURL(entry).href) {
  const violations = checkRepository(process.cwd())
  if (violations.length > 0) {
    for (const violation of violations) console.error(`✖ ${violation}`)
    console.error(`\n${violations.length} policy violation(s)`)
    process.exit(1)
  }
  console.log('✓ repository policy checks passed')
}
