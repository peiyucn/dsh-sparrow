import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

/**
 * 判断 `/` 是**正则字面量**的开头还是除号：看「已产出的代码」里最近的非空字符 ——
 * 标识符 / 数字 / `)` / `]` / `}` ⇒ 除号；末尾是关键字（`return` / `typeof` …）或什么都没有 ⇒ 正则。
 */
function regexCanStartAfter(out) {
  const trimmed = out.replace(/[ \t\r\n]+$/u, '')
  if (trimmed === '') return true
  const last = trimmed.at(-1)
  if (!/[A-Za-z0-9_$)\]}'"`]/u.test(last)) return true
  // 末尾是标识符时要看它是不是关键字：`return /x/` 是正则，`a / b` 是除号。
  const word = /([A-Za-z_$][A-Za-z0-9_$]*)$/u.exec(trimmed)?.[1]
  return word !== undefined && KEYWORDS_BEFORE_REGEX.has(word)
}

/** 这些关键字之后的 `/` 一定是正则开头。 */
const KEYWORDS_BEFORE_REGEX = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw',
  'case', 'do', 'else', 'yield', 'await', 'default',
])

/**
 * 剥掉源码里的**注释**，只留代码 —— 本文件所有锚点定位都必须跑在它的输出上，不得直接用原文：
 * 否则只要在更靠前的注释里写出同一个字面量，`indexOf` 锚点就被提前到那条注释上，守卫全部失效。
 * 覆盖 `//`、`/* *\/`（含 JSDoc）、字符串 / 模板字面量与**正则字面量** —— 正则那一路不是可选的：
 * 插件源码里的 `/[\\"]/gu` 体内含引号，不认正则会让扫描器脱轨、其后所有注释都剥不掉。
 * 注释体内的换行原样折算保留，故剥完仍是**行号对齐**的文本。
 */
function codeOnly(src) {
  const len = src.length
  let out = ''
  let i = 0
  while (i < len) {
    const ch = src[i]
    const next = src[i + 1]

    // 行注释：剥到行尾；换行留到下一轮追加（保住行号）
    if (ch === '/' && next === '/') {
      while (i < len && src[i] !== '\n') i += 1
      continue
    }
    // 块注释（含 JSDoc）：剥到 */，体内换行折算保留
    if (ch === '/' && next === '*') {
      i += 2
      while (i < len && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') out += '\n'
        i += 1
      }
      if (i >= len) break // 未闭合的块注释：剥到文件尾
      i += 2
      continue
    }
    // 正则字面量：整体原样保留（体内可以出现引号与 `//`，见函数头）。
    if (ch === '/' && regexCanStartAfter(out)) {
      out += ch
      i += 1
      let inClass = false
      let closed = false
      while (i < len) {
        const c = src[i]
        if (c === '\\') { out += c + (src[i + 1] ?? ''); i += 2; continue }
        if (c === '\n') break // 未闭合：就此收手，不越过行尾
        out += c
        i += 1
        if (c === '[') inClass = true
        else if (c === ']') inClass = false
        else if (c === '/' && !inClass) { closed = true; break }
      }
      if (!closed) continue
      while (i < len && /[a-z]/iu.test(src[i])) { out += src[i]; i += 1 } // flags
      continue
    }
    // 字符串 / 模板字面量：整体原样保留（体内的 `//` 不是注释）
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch
      out += ch
      i += 1
      while (i < len) {
        if (src[i] === '\\') {
          out += src[i] + (src[i + 1] ?? '')
          i += 2
          continue
        }
        out += src[i]
        if (src[i] === quote) { i += 1; break }
        i += 1
      }
      continue
    }
    out += ch
    i += 1
  }
  return out
}

/** 读源文件并剥注释 —— **锚点一律用它**，不用原文。 */
async function readCode(rel) {
  return codeOnly(await readFile(new URL(rel, import.meta.url), 'utf8'))
}

/** 把一条 glob 编译成正则，语义按 npm `files` 的 minimatch：`**` 跨路径段、`*` 不跨 `/`、`?` 单字符。 */
function globToRegExp(glob) {
  let re = ''
  for (let i = 0; i < glob.length; i += 1) {
    const ch = glob[i]
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        i += 1
        // `**/` 连同那个 `/` 一起吃掉，使 `a/**/b` 能匹配 `a/b`（零段）
        if (glob[i + 1] === '/') { i += 1; re += '(?:.*/)?' } else { re += '.*' }
      } else {
        re += '[^/]*'
      }
    } else if (ch === '?') {
      re += '[^/]'
    } else {
      re += ch.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
    }
  }
  return new RegExp(`^${re}$`, 'u')
}

/**
 * 按 `package.json` 的 `files` 判断某个包内路径**会不会被打进 npm 包**：命中至少一条正向 glob、
 * 且不被任何 `!` 否定项命中 ⇒ 会打包。**本函数存在的唯一理由**：原守卫写成
 * `files.includes('lib/**\/*.js') || files.includes(...)`，短路恒在第一支 ⇒ 依赖名不存在也恒真。
 */
function willBePacked(files, filePath) {
  let included = false
  for (const pattern of files) {
    const negated = pattern.startsWith('!')
    const glob = negated ? pattern.slice(1) : pattern
    if (!globToRegExp(glob).test(filePath)) continue
    if (negated) return false // 否定项命中即出局（后写的否定项不例外，同 npm 的「任一否定即排除」）
    included = true
  }
  return included
}

/**
 * 从 `startIdx` 起截出**整条调用**（含括号内全部内容，括号配平、跳过字符串字面量）——
 * 固定宽度窗口（`slice(i, i + N)`）在实现或注释变长时会静默截到别人身上，按配平截才与宽度无关。
 */
function callTextAt(code, startIdx) {
  const open = code.indexOf('(', startIdx)
  if (open < 0) return ''
  let depth = 0
  let i = open
  while (i < code.length) {
    const ch = code[i]
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch
      i += 1
      while (i < code.length) {
        if (code[i] === '\\') { i += 2; continue }
        if (code[i] === quote) { i += 1; break }
        i += 1
      }
      continue
    }
    if (ch === '(') depth += 1
    else if (ch === ')') {
      depth -= 1
      if (depth === 0) return code.slice(startIdx, i + 1)
    }
    i += 1
  }
  return code.slice(startIdx)
}

/** 截出挂载点事件监听器的**整条调用**；找不到返回 `''`。 */
function listenerTextFor(code, event) {
  const idx = code.indexOf(`ctx.on('${event}'`)
  return idx < 0 ? '' : callTextAt(code, idx)
}

/** 截出指定 effect id 的那条 `ctx.effect(...)` 调用（含清理体）；找不到返回 `''`。 */
function effectTextFor(code, effectId) {
  const idIdx = code.indexOf(`'${effectId}'`)
  if (idIdx < 0) return ''
  // 该 id 前面最近的一个 `ctx.effect(` 就是承载它的那条调用。
  const idx = code.lastIndexOf('ctx.effect(', idIdx)
  return idx < 0 ? '' : callTextAt(code, idx)
}

/** 从 `startIdx` 起截出箭头函数的**函数体**（`=> {` 起到配平闭括号，跳过字符串字面量）。 */
function bodyTextAt(code, startIdx) {
  const arrow = code.indexOf('=>', startIdx)
  if (arrow < 0) return ''
  const open = code.indexOf('{', arrow)
  if (open < 0) return ''
  let depth = 0
  let i = open
  while (i < code.length) {
    const ch = code[i]
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch
      i += 1
      while (i < code.length) {
        if (code[i] === '\\') { i += 2; continue }
        if (code[i] === quote) { i += 1; break }
        i += 1
      }
      continue
    }
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return code.slice(open, i + 1)
    }
    i += 1
  }
  return code.slice(open)
}

describe('dsh-theme-tone 结构', () => {
  it('codeOnly 应该 只剥注释：行注释 / 块注释 / JSDoc，且不碰字符串与模板字面量', () => {
    // 这是**元守卫**：本文件其余所有锚点断言的可信度都挂在它身上。
    const sample = [
      '// 整行注释',
      "const a = 'http://x//y' // 尾注释",
      '/* 块注释 */ const b = 1',
      '/**',
      ' * JSDoc',
      ' */',
      'const c = `模板里的 // 不是注释`',
      "const d = '带 /* 的字符串'",
    ].join('\n')
    const out = codeOnly(sample)
    assert.ok(!out.includes('整行注释'), '行注释应被剥掉')
    assert.ok(!out.includes('尾注释'), '行尾注释应被剥掉')
    assert.ok(!out.includes('块注释'), '块注释应被剥掉')
    assert.ok(!out.includes('JSDoc'), 'JSDoc 应被剥掉')
    assert.match(out, /const a = 'http:\/\/x\/\/y'/, '字符串里的 // 必须原样保留')
    assert.ok(out.includes('const b = 1'), '块注释后的代码必须保留')
    assert.ok(out.includes('模板里的 // 不是注释'), '模板字面量内容必须保留')
    assert.ok(out.includes('带 /* 的字符串'), '单引号字符串里的 /* 必须保留')
    assert.equal(out.split('\n').length, sample.split('\n').length, '剥注释不得改变行数（保住行号对齐）')
    // 真源码：剥完必须仍含关键实现，且不再含只出现在注释里的句子
    assert.equal(codeOnly('const x = 1\n'), 'const x = 1\n', '无注释源码应原样返回')
  })

  it('codeOnly 应该 认正则字面量 —— 体内含引号 / // 也不得让扫描器脱轨', () => {
    // 真实陷阱：插件源码的 `/[\\"]/gu` 体内有引号，不认正则就会把那个 `"` 当成字符串开头 ⇒
    // 其后所有注释都剥不掉（漏剥方向安全，但等于把本函数要堵的洞原样放回来）。
    const sample = [
      "return value.replace(/[\\\\\"]/gu, c => '\\\\' + c)",
      '// 这行注释必须被剥掉',
      'const after = 1',
      'const div = a / b / c',
      'const re = /^body\\b/u',
    ].join('\n')
    const out = codeOnly(sample)
    assert.ok(!out.includes('这行注释必须被剥掉'), '正则之后的注释仍必须被剥掉（脱轨检查）')
    assert.ok(out.includes('const after = 1'), '正则之后的代码必须保留')
    assert.ok(out.includes('/[\\\\"]/gu'), '正则字面量本身必须原样保留')
    assert.ok(out.includes('const div = a / b / c'), '除号不得被误当正则吞掉')
    assert.ok(out.includes('/^body\\b/u'), '末尾带 flags 的正则要完整保留')
    // 反向哨兵：含引号的正则之后的注释必须照样剥掉。
    assert.equal(codeOnly("const r = /['\"]/u\n// c\n").includes('// c'), false, '含引号的正则后注释须剥掉')
  })

  it('codeOnly 应该 让「注释里写出锚点字面量」不再能提前锚点（锚点加固的元守卫）', () => {
    // 直接钉住加固的**因果**：同一段代码注释里塞了锚点字面量时，剥注释前后 indexOf 的落点必须不同。
    const bait = [
      '// const paintPlain = ',
      'const real = 1',
      'const paintPlain = () => {}',
    ].join('\n')
    assert.ok(bait.indexOf('const paintPlain = ') < bait.indexOf('const real = 1'),
      '前提：裸 indexOf 会被注释里的字面量骗到（落在第 1 行）')
    const stripped = codeOnly(bait)
    assert.ok(stripped.indexOf('const paintPlain = ') > stripped.indexOf('const real = 1'),
      '剥注释后锚点必须落回真代码（在 real 之后）')
  })

  it('package.json 应该 声明 dsh.bundle 与 dsh.client（client bundle 路径）', async () => {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
    assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
    assert.equal(pkg.dsh.client.platform, 'web')
    assert.equal(pkg.exports['./client'].default, './lib/client.js')
    assert.ok(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-theme'))
    assert.ok(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-settings'))
  })

  it('package.json files 应该 真的覆盖 lib/<dep>.js（防发布包缺文件回归，含否定项）', async () => {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
    const index = await readCode('../src/index.ts')
    const deps = [...index.matchAll(/from '\.\/([^']+)\.js'/gu)].map(match => match[1])
    assert.ok(deps.length > 0, 'index.ts 应有静态 re-export')
    for (const dep of deps) {
      // 必须走 willBePacked（glob 语义 + 否定项），退回 `files.includes(...)` 则依赖名不存在也恒真。
      assert.ok(
        willBePacked(pkg.files, `lib/${dep}.js`),
        `files 未覆盖 lib/${dep}.js（src/index.ts 静态 re-export 了它，发布包会缺文件）`,
      )
    }
    // 反向哨兵 ①：确认 `!lib/client/**` 否定项真的生效，否则上面那条会退化成「写了一条 lib/**/*.js 就恒真」。
    assert.ok(
      !willBePacked(pkg.files, 'lib/client/index.js'),
      'lib/client/** 应被否定项排除（client bundle 走 ./client 导出，不进主包）',
    )
    // 反向哨兵 ②：用合成清单自检 willBePacked 的语义 —— 原写法正是在这里恒真
    //（`files.includes('lib/**/*.js')` 是常量，与 dep 无关）。
    assert.equal(willBePacked(['lib/index.js'], 'lib/host.js'), false, '无规则覆盖时必须判否')
    assert.equal(willBePacked(['lib/**/*.js'], 'lib/host.js'), true, '`lib/**/*.js` 应覆盖 lib/host.js')
    assert.equal(willBePacked(['lib/**/*.js'], 'lib/sub/host.js'), true, '`**` 应跨路径段')
    assert.equal(willBePacked(['lib/*.js'], 'lib/sub/host.js'), false, '`*` 不得跨路径段')
    assert.equal(
      willBePacked(['lib/**/*.js', '!lib/client/**'], 'lib/client/index.js'), false,
      '否定项命中即出局（即使正向 glob 也命中）',
    )
  })

  it('行顺序应该 插在官方外观（10）与字号（11）之间 —— 「紧挨外观下面」', async () => {
    const { ROW_ORDER, ROW_ID } = await import('../lib/constants.js')
    // 官方两个整数都被占了：外观 order 10、字号 order 11；列表按数值升序渲染，取两者之间的小数即落在「外观」正下方。
    assert.equal(ROW_ID, 'theme-tone')
    assert.ok(
      ROW_ORDER > 10 && ROW_ORDER < 11,
      `ROW_ORDER=${ROW_ORDER} 应落在 (10, 11)，否则会跑到字号下面`,
    )
  })

  it('cordis.patch.yml 应该 按 bundle patch 结构插入 host 行', async () => {
    const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
    assert.match(patch, /- insert:/u)
    assert.match(patch, /id: dsh-theme-tone/u)
    assert.match(patch, /name: '@dsh-sparrow\/dsh-theme-tone'/u)
  })

  it('client bundle externals 应该 只含平台种子词', async () => {
    const script = await readCode('../scripts/bundle-client.mjs')
    const block = /external: \[([\s\S]*?)\]/u.exec(script)
    assert.ok(block, '未找到 external 清单')
    const entries = [...block[1].matchAll(/'([^']+)'/gu)].map(match => match[1])
    // 官方 PLATFORM_MODULES —— 模块表恒可应答的种子词。
    const platform = new Set([
      'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
      '@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-slots',
      '@deepseek-ai/dsh-client-ui-primitives', '@deepseek-ai/dsh-client-ui-dockkit',
    ])
    for (const entry of entries) {
      assert.ok(platform.has(entry), `${entry} 不是平台种子词 —— 运行时 require 会落空`)
    }
  })

  it('schema 应该 与色调表分离，schemastery 不得进入客户端 bundle', async () => {
    const schema = await readCode('../src/settings-schema.ts')
    assert.match(schema, /from '@deepseek-ai\/schemastery'/u, 'settings-schema.ts 应持有 schema')
    // 客户端会内联 tones / backdrop / constants，故这三者不得真的 import schemastery（按 import 语句判定，不看注释）。
    const imported = /(?:^|\n)\s*import[^\n]*['"]@deepseek-ai\/schemastery['"]/u
    for (const rel of ['../src/tones.ts', '../src/backdrop.ts', '../src/constants.ts', '../src/client/index.ts']) {
      const source = await readCode(rel)
      assert.ok(!imported.test(source), `${rel} 不得 import schemastery（会进客户端 bundle）`)
    }
  })

  it('⛔ 设置「未就绪」时不得用默认值上色（否则每次冷加载都闪一下默认配色）', async () => {
    // 回归守卫：`status === 'loading'` 时 `value` 也是 undefined，写成 `value ?? DEFAULT_SETTINGS` 会先按
    // 默认画一遍（浅 official / 深 violet），等宿主回值再纠正 ⇒ 改过色调的用户每次冷加载都看到跳变。
    const src = await readCode('../src/client/index.ts')
    assert.ok(
      !/\.value \?\? DEFAULT_SETTINGS/u.test(src),
      '不得用 `value ?? DEFAULT_SETTINGS` —— 未就绪时会画默认值',
    )
    assert.match(src, /status !== 'loading'/u, '必须有「loading 不上色」的门')
    assert.match(src, /shouldPaint/u, 'repaint 要经过 shouldPaint 门')
  })

  it('⛔ 宿主不可写时必须落到进程内兜底并告警（不得静默空操作）', async () => {
    // 回归守卫：官方设置表单在 memory 模式下把写入当空操作（`set()` 返回 false）、也不会有宿主推送；
    // 若 setTone 只调 scope.set，用户点色调会毫无反应且无日志。
    const src = await readCode('../src/client/index.ts')
    assert.match(src, /localSettings/u, '要有进程内兜底值')
    assert.match(src, /snapshot\.writable/u, 'setTone 要检查 writable')
    assert.match(src, /warnUser\(/u, '不可持久化 / 停用时要走面向用户的告警（logger + console）')
    // 分支里必须真的写兜底值 + 立刻重绘，顺序是「本地落值 → 重绘 → 发写入」；只断言**相对顺序**。
    const i = src.indexOf('setTone:')
    assert.ok(i > 0, '找不到 setTone')
    const seg = src.slice(i, i + 4000)
    assert.ok(seg.includes('localSettings'), 'setTone 不可写分支要写 localSettings')
    assert.ok(seg.includes('repaint()'), 'setTone 不可写分支要立刻重绘')
    const localAt = seg.indexOf('localSettings = ')
    const repaintAt = seg.indexOf('repaint()')
    // ⚠️ 必须匹配**真实调用** `void scope.set(` —— 上面的注释里也提到了 `scope.set()`。
    const setAt = seg.indexOf('void scope.set(')
    assert.ok(localAt >= 0 && repaintAt > localAt && setAt > repaintAt,
      `顺序必须是「先本地落值 → 立刻重绘 → 再发写入」（local=${localAt} repaint=${repaintAt} set=${setAt}）`)
  })

  it('⛔ 写轴必须等于渲染轴（否则浅色选的 id 会被写进深色字段，宿主直接拒）', async () => {
    // 回归守卫：行渲染哪一轴取决于 store 的 colorScheme；写入时若重新查 `ctx.theme.getTheme()`，
    // 两者在模式切换窗口内会错开 ⇒ 把浅色轴 id 写进 darkTone，两轴合法集合不重叠 ⇒ 宿主 schema 拒绝。
    const src = await readCode('../src/client/index.ts')
    const i = src.indexOf('setTone:')
    assert.ok(i > 0, '找不到 setTone')
    // ⚠️ 必须先剥注释再断言：本段注释里**故意**写着 `ctx.theme.getTheme()` 作反面教材，不剥会把说明当实现。
    const seg = src.slice(i, i + 2000).replace(/\/\*[\s\S]*?\*\//gu, '').replace(/\/\/[^\n]*/gu, '')
    assert.ok(!/getTheme\(\)/u.test(seg), 'setTone 不得重新查询实时主题来决定写哪一轴')
    assert.match(seg, /toneFieldFor\(scheme\)/u, '写轴必须用传入的 scheme')
    // 行组件必须把**渲染用的轴**一起传下来
    const row = await readCode('../src/client/ThemeToneRow.tsx')
    assert.match(row, /setTone: \(id: ToneId, scheme: ColorScheme\) => void/u, '注入面要收 scheme')
    assert.match(row, /setTone\(id, colorScheme\)/u, 'onClick 要传渲染轴 colorScheme')
  })

  it('⛔ 行同步不得被「未就绪不上色」那道门挡住（否则浅色页面显示深色卡片）', async () => {
    // 同一事故的第二层：`shouldPaint()` 只管**上色**，而「行渲染哪一轴」只取决于当前主题；
    // 曾把 `boundRow.sync` 排在门后面 ⇒ loading 期间行不更新，浅色页面显示深色轴卡片。
    const src = await readCode('../src/client/index.ts')
    // 抽出 syncRow 与 paintLayer 的位置：syncRow 必须在每个 shouldPaint 早退之前。
    const syncIdx = src.indexOf('const syncRow =')
    assert.ok(syncIdx > 0, '应有独立的 syncRow')
    // paintLayer 体内：syncRow 调用必须早于该函数里的 `if (!shouldPaint()) return`
    const plIdx = src.indexOf('const paintLayer =')
    const pl = src.slice(plIdx, plIdx + 1600)
    const syncCall = pl.indexOf('syncRow(')
    const gateCall = pl.indexOf('if (!shouldPaint())')
    assert.ok(syncCall > 0 && gateCall > 0, 'paintLayer 里应同时有 syncRow 与门')
    assert.ok(syncCall < gateCall, 'paintLayer 里的 syncRow 必须排在门之前')
    // repaint 同理
    const rpIdx = src.indexOf('const repaint =')
    const rp = src.slice(rpIdx, rpIdx + 1200)
    const rpSync = rp.indexOf('syncRow(')
    const rpGate = rp.indexOf('if (!shouldPaint())')
    assert.ok(rpSync > 0 && rpGate > 0 && rpSync < rpGate, 'repaint 里的 syncRow 必须排在门之前')
  })

  it('⛔ 行 store 初值取实时主题轴（写死 dark 会让浅色页面首帧就画错）', async () => {
    // 同一事故的第三层：store 初值曾写死 `colorScheme: 'dark'`，浅色页面首次 sync 之前会渲染深色轴卡片。
    const store = await readCode('../src/client/store.ts')
    assert.match(store, /scheme: ColorScheme = 'dark'/u, '签名应接受调用方传入的轴')
    assert.match(store, /init: \(\): ThemeToneRowState => \(\{ colorScheme: scheme/u, 'init 要用传入的 scheme')
    const src = await readCode('../src/client/index.ts')
    assert.match(src, /createThemeToneRowStore\(ctx\.theme\.getTheme\(\)\.active\.colorScheme\)/u,
      'apply 处必须传实时主题轴')
  })

  it('⛔ 两轴合法色调集合不得重叠（跨轴写入必被 schema 拒）', async () => {
    // 事故的**前提条件**：两轴 id 集合不重叠，故「写错轴」不是观感问题而是**写入被拒**。
    // 若将来两轴集合合并成一个，本守卫会失败 —— 那时先确认前提真的变了，别默默让守卫失效。
    const { LIGHT_TONE_IDS, DARK_TONE_IDS } = await import('../lib/tones.js')
    const overlap = LIGHT_TONE_IDS.filter(id => DARK_TONE_IDS.includes(id))
    assert.deepEqual(overlap, ['official'], '两轴只应共享 official（其余必须互斥）')
    assert.ok(LIGHT_TONE_IDS.some(id => !DARK_TONE_IDS.includes(id)), '浅色轴要有深色轴没有的 id')
  })

  it('⛔ client inject 只放跨版本稳定服务（易变面进 inject 会把宿主整页拖死）', async () => {
    // 回归守卫：`inject` 里放新版宿主已改名 / 移除的服务时 fiber 永远 pending，
    // 而客户端 boot 审计把 pending 当致命失败 ⇒ 宿主 Web UI 完全起不来。
    const src = await readCode('../src/client/index.ts')
    const inject = /export const inject = \[([^\]]*)\]/u.exec(src)?.[1] ?? ''
    const names = [...inject.matchAll(/'([^']+)'/gu)].map(match => match[1])
    assert.deepEqual(names, ['theme', 'slots', 'locale'], 'inject 只允许放跨版本稳定存在的服务')
    assert.ok(!/settings/u.test(inject), '设置面不得进 inject —— 它是会被宿主改名 / 移除的易变面')
    assert.match(
      src,
      /ctx\.inject\(\s*\[\s*'configForms'\s*\]/u,
      '设置面要走 ctx.inject 起的可选依赖 fork（缺了只是不装，entry 仍 active）',
    )
  })

  it('⛔ client half 的能力门不得抛错（抛错 = 宿主整页起不来）', async () => {
    // 客户端侧没有「逐插件捕获 apply 异常」的隔离：任何非 active 的 entry 都是致命失败
    // ⇒ client half 走惰性停用（告警 + return），不使用抛错版能力门。
    const src = await readCode('../src/client/index.ts')
    assert.match(src, /warnMissingCapabilities\(/u, 'client half 要走不抛错的能力门')
    assert.ok(!/assertCapabilities/u.test(src), 'client half 不得用抛错版能力门')
    const iGate = src.indexOf('warnMissingCapabilities(')
    const iReturn = src.indexOf('])) return')
    const iInstall = src.indexOf('function install(')
    const iStyles = src.indexOf('resources.style = ensureStyles()')
    assert.ok(iGate > 0 && iReturn > 0 && iInstall > 0 && iStyles > 0, '锚点缺失（实现改过？）')
    assert.ok(iGate < iReturn, '门不通过要直接 return（不继续装）')
    assert.ok(iReturn < iInstall && iInstall < iStyles, '惰性停用必须在创建 style / 背景层之前返回')
  })

  it('⛔ 资源必须先武装清理、再创建（中途抛错不得留下无生命周期的 style / 层）', async () => {
    // 回归守卫：cordis 只跑**已注册**的 disposer。若先 ensureStyles/ensureLayer 再注册清理，
    // 中间任一环节抛错都会让 <style> 与背景层永久残留，且门属性从未置上 ⇒ 带门规则全部 fail-open。
    const src = await readCode('../src/client/index.ts')
    const iCleanup = src.indexOf('dsh-theme-tone: backdrop + token overrides')
    const iStyles = src.indexOf('resources.style = ensureStyles()')
    const iLayer = src.indexOf('resources.layer = ensureLayer()')
    assert.ok(iCleanup > 0 && iStyles > 0 && iLayer > 0, '锚点缺失（实现改过？）')
    assert.ok(iCleanup < iStyles, '清理 effect 必须注册在 ensureStyles() **之前**')
    assert.ok(iCleanup < iLayer, '清理 effect 必须注册在 ensureLayer() **之前**')
    // 清理里不得直接引用 style/layer 常量，要用 holder —— 否则 ensureLayer 抛错时 style 已创建却无人回收。
    assert.match(src, /resources\.style\?\.remove\(\)/u, '清理要从 holder 取 style')
    assert.match(src, /resources\.layer\?\.remove\(\)/u, '清理要从 holder 取 layer')
  })

  it('⛔ 门属性必须先关成「官方默认」再注入样式表（loading 窗口不得 fail-open）', async () => {
    // 回归守卫：门属性是 `body:not([PLAIN_ATTR])` 的唯一开关，此前只在 paintLayer 里写；
    // 「注入」到「宿主回值」之间存在窗口，门属性不存在 ⇒ 带门规则当场命中，选「官方默认」的用户先看到玻璃。
    const src = await readCode('../src/client/index.ts')
    const iClose = src.indexOf('paintPlain(true)')
    const iStyles = src.indexOf('resources.style = ensureStyles()')
    const iLayer = src.indexOf('resources.layer = ensureLayer()')
    assert.ok(iClose > 0, '注入样式表前必须先把门关成官方默认（缺 paintPlain(true)）')
    assert.ok(iClose < iStyles, 'paintPlain(true) 必须在 ensureStyles() **之前**')
    assert.ok(iClose < iLayer, 'paintPlain(true) 必须在 ensureLayer() **之前**')
    // 声明必须早于清理 effect（清理体要调它，否则该窗口内跑清理会撞 TDZ，把真正的失败原因盖掉）。
    const iDecl = src.indexOf('const paintPlain = ')
    const iCleanup = src.indexOf('dsh-theme-tone: backdrop + token overrides')
    assert.ok(iDecl > 0 && iCleanup > 0, '锚点缺失（实现改过？）')
    assert.ok(iDecl < iCleanup, 'paintPlain 必须声明在清理 effect 之前（否则清理会撞 TDZ）')
  })

  it('⛔ theme/change 那条直达 paintLayer 的路径也要过 shouldPaint 门', async () => {
    // theme/change 由 ui-theme 自己的 settings scope 驱动，与本插件 settings 就绪没有先后保证；
    // 若它绕过 shouldPaint()，就会用进程内兜底值把门打开 —— 与上一条是同一个洞的另一个入口。
    const src = await readCode('../src/client/index.ts')
    // ⚠️ 按括号配平截**整条函数体**，不用固定宽度 slice（固定窗口会静默截到别人身上 / 把门截出去）。
    const i = src.indexOf('const paintLayer = (snapshot: ThemeSnapshot)')
    assert.ok(i > 0, '缺 paintLayer 定义（签名改过？）')
    const seg = bodyTextAt(src, i)
    assert.ok(seg.length > 0, '缺 paintLayer 定义')
    assert.ok(seg.includes('shouldPaint()'), 'paintLayer 必须先过 shouldPaint 门')
    assert.ok(
      seg.indexOf('shouldPaint()') < seg.indexOf('paintPlain('),
      'shouldPaint 门必须在 paintPlain 之前',
    )
  })

  it('⛔ theme/change 的监听器必须委托 paintLayer，不得自己读设置 / 自己上色（第二入口守卫）', async () => {
    // 回归守卫：上一条只断言 **paintLayer 函数体内**有门，没断言 theme/change **真的经 paintLayer 走**；
    // 就地改写成自己 readSettings() + paintPlain(...) 即可绕开门，上一条仍全绿、洞照旧。
    const src = await readCode('../src/client/index.ts')
    const listener = listenerTextFor(src, 'theme/change')
    assert.ok(listener.length > 0, '找不到 theme/change 的 ctx.on 监听器（实现改过？）')
    // ① 必须委托给 paintLayer —— 那道 shouldPaint 门在被调方里
    assert.ok(
      /paintLayer\(/u.test(listener),
      'theme/change 监听器必须委托给 paintLayer（那是唯一带 shouldPaint 门的入口）',
    )
    // ② 回调体不得自行读设置 / 自行上色 —— 这些动作一旦出现在这里，就等于绕开了门
    for (const forbidden of ['syncRow', 'readSettings', 'paintPlain']) {
      assert.ok(
        !listener.includes(forbidden),
        `theme/change 监听器不得自己调 ${forbidden}（会让 paintLayer 里的 shouldPaint 门形同虚设）`,
      )
    }
  })

  it('⛔ 卸载必须把门属性摘干净（不得残留 body 上的 PLAIN_ATTR）', async () => {
    // 回归守卫：卸载时摘门属性是**必须**的，但把 `paintPlain(false)` 删掉后全绿（卸载路径零覆盖）。
    // 残留后果：门属性留在 body 上，此后任何人写的 `body:not([PLAIN_ATTR])` 规则全部让路。
    const src = await readCode('../src/client/index.ts')
    const effect = effectTextFor(src, 'dsh-theme-tone: backdrop + token overrides')
    assert.ok(effect.length > 0, '找不到资源清理 effect（实现改过？）')
    assert.ok(
      /paintPlain\(false\)/u.test(effect),
      '卸载清理必须调 paintPlain(false) 摘掉门属性',
    )
    // 待启动态标记同理（本插件加的属性，卸载必须一并收干净）。
    assert.ok(
      /removeAttribute\(WORKSTART_ATTR\)/u.test(effect),
      '卸载清理必须摘掉 WORKSTART_ATTR',
    )
  })

  it('⛔ 乐观值必须按「哪一笔」收，不得再按「快照 revision 前进过」收（来回跳的根因）', async () => {
    // 事故：旧实现按「revision 变了 = 有结论」收乐观值，单笔在途成立、**多笔在途时是错的** ——
    // 先发那笔的结算同样让 revision 前进，于是后发那笔的乐观值被误当作废（画面回跳）。
    // 修法：归属按「哪一笔」记账，由那一笔自己的结算收回；本守卫钉脱钩 revision、repaint 不再收。
    const src = await readCode('../src/client/index.ts')
    assert.match(src, /createPendingToneTracker\(/u, '要用按笔归属的 tracker')
    assert.ok(
      !/clearSettledPending/u.test(src),
      '⛔ 不得再有按 revision 收乐观值的 clearSettledPending',
    )
    // repaint 体内不得出现「收乐观值」的调用 —— 它会被别的推进（另一笔的结算 / describe 回读）触发。
    const rpIdx = src.indexOf('const repaint = (')
    assert.ok(rpIdx > 0, '缺 repaint 定义（签名改过？）')
    const rp = bodyTextAt(src, rpIdx)
    assert.ok(rp.length > 0, '缺 repaint 定义')
    assert.ok(
      !/settlePending\s*\(/u.test(rp),
      '⛔ repaint 里不得收乐观值（会把手更新的那一笔误当作废）',
    )
    // setTone 必须挂 .then 结算自己那一笔，且两条路（接受 / 传输失败）都收。
    const i = src.indexOf('setTone:')
    assert.ok(i > 0, '找不到 setTone')
    const seg = src.slice(i, i + 4000)
    assert.match(seg, /pendingTones\.begin\(field, id\)/u, 'setTone 要按字段发号')
    assert.match(seg, /scope\.set\(field, id\)\.then\(/u, 'setTone 要结算自己那一笔')
    assert.ok(
      (seg.match(/settlePending\(pending\)/gu) ?? []).length >= 2,
      '接受与传输失败两条路都要结算（否则乐观值会永久留着）',
    )
  })
})
