import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { DEFAULT_MODEL } from '../lib/suggest.js'
import { globToRegExp, isPacked } from './helpers/pack-glob.mjs'

describe('dsh-chat-fim 结构', () => {
  it('package.json 应该 声明 dsh.bundle 与 dsh.client', async () => {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
    assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
    assert.equal(pkg.dsh.client.platform, 'web')
    assert.ok(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-conversation'))
    assert.equal(pkg.exports['./client'].default, './lib/client.js')
  })

  it('package.json files 应该 覆盖 lib/index.js 的运行时依赖（防发布包缺文件回归）', async () => {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
    const index = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8')
    const deps = [...index.matchAll(/from '\.\/([^']+)\.js'/gu)].map(match => match[1])
    assert.ok(deps.length > 0, 'src/index.ts 应当静态 re-export 至少一个模块')
    // 逐条按 files 清单的 glob 语义真判（含否定项）——旧写法
    // `files.includes('lib/**/*.js') || files.includes(`lib/${dep}.js`)` 短路口恒在第一支，
    // 依赖名不存在也恒真，等于没守（本文件末尾的 `files 清单 glob 语义` 组钉住这点）。
    for (const dep of deps) {
      assert.ok(
        isPacked(`lib/${dep}.js`, pkg.files),
        `files 清单不覆盖 lib/${dep}.js（lib/index.ts 静态 re-export 了它）`,
      )
    }
  })

  it('cordis.patch.yml 应该 按 bundle patch 结构插入 host 行', async () => {
    const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
    assert.match(patch, /- insert:/u)
    assert.match(patch, /id: dsh-chat-fim/u)
    assert.match(patch, /name: '@dsh-sparrow\/dsh-chat-fim'/u)
    assert.match(patch, /apiKeyEnv: DEEPSEEK_API_KEY/u)
  })

  it('两个 patch 文件的补全模型 应该 都与 DEFAULT_MODEL 一致（防配置漂移）', async () => {
    // `cordis.patch.yml` 是**随包发布**的组合补丁（loader 按包名解析），任何环境都存在；
    // `dev.patch.yml` 是**本机开发用的 overlay**（name 是本机绝对路径、不进仓库，见 .gitignore），
    // 干净检出 / CI 上不存在 —— 故只在它存在时才比对，不因缺文件而红。
    for (const file of ['../cordis.patch.yml', '../dev.patch.yml']) {
      const url = new URL(file, import.meta.url)
      if (!existsSync(url)) {
        assert.equal(file, '../dev.patch.yml', `${file} 应当存在（只有本机开发 overlay 允许缺席）`)
        continue
      }
      const patch = await readFile(url, 'utf8')
      const match = /^\s*model:\s*(\S+)\s*$/mu.exec(patch)
      assert.equal(match?.[1], DEFAULT_MODEL, `${file} 的 model 与 DEFAULT_MODEL 不一致`)
    }
  })

  /**
   * files 守卫的**自证**：钉住 glob 判定的语义，防止守卫自己退化成恒真 / 恒假
   * （上一版就是恒真：短路停在写死的 `lib/** /*.js` 上，依赖名不存在也过）。
   */
  it('files 清单 glob 语义自证：`**` 跨层与零层、`*` 不跨层、否定项后写者胜', () => {
    const files = ['lib/**/*.js', '!lib/client/**', 'lib/types/**/*.d.ts']
    // 正向命中
    assert.equal(isPacked('lib/host.js', files), true, 'lib/**/*.js 应当覆盖 lib/host.js')
    assert.equal(isPacked('lib/deep/nested/x.js', files), true, '** 应当跨层')
    assert.equal(isPacked('lib/types/host.d.ts', files), true, 'lib/types/**/*.d.ts 应当覆盖一层')
    // 否定项排除（后写者胜）
    assert.equal(isPacked('lib/client/index.js', files), false, '!lib/client/** 必须排掉客户端产物')
    assert.equal(isPacked('lib/client.js', files), true, '否定项不得误伤 lib/client.js 本体')
    // 未命中任何规则
    assert.equal(isPacked('lib/host.ts', files), false, '清单只声明了 .js')
    assert.equal(isPacked('src/host.js', files), false, '清单不含 src/')
    assert.equal(isPacked('lib/a/b.js', ['lib/*.js']), false, '单星不跨层')
    // 对照：旧写法恒真（本轮的修因）——连否定项排除掉的产物、以及根本不在清单里的路径都放行
    const legacyGuard = (dep) => files.includes('lib/**/*.js') || files.includes(`lib/${dep}.js`)
    assert.equal(legacyGuard('client/index'), true, '（对照）旧写法对 `!lib/client/**` 排掉的产物恒真')
    assert.equal(isPacked('lib/client/index.js', files), false, '新判定认否定项：客户端产物不进包')
    assert.equal(legacyGuard('types/x.d.ts'), true, '（对照）旧写法对清单没声明的扩展名恒真')
    assert.equal(isPacked('lib/types/x.d.ts', files), true, 'lib/types 下的 .d.ts 在清单内')
    assert.equal(isPacked('lib/types/x.js', files), true, '`lib/**/*.js` 同样覆盖 types 下的 js')
    assert.ok(globToRegExp('lib/**/*.js').test('lib/host.js'), '双星后接斜杠时连零层目录都算')
  })
})
