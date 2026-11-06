// @ts-check
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { describe, it } from 'node:test'

const read = (relative) => readFile(new URL(`../${relative}`, import.meta.url), 'utf8')
const json = async (relative) => JSON.parse(await read(relative))

/** All client TS/TSX sources joined: structure guards survive component/hook splits. */
const CLIENT_DIR = new URL('../src/client/', import.meta.url)
/** Shell + notes feature styles concatenated (CSS is split by feature module). */
const readStyles = async () => [
  await read('src/client/app/styles.ts'),
  await read('src/client/notes/styles.ts'),
  await read('src/client/tasks/styles.ts'),
].join('\n')

const readClientSurface = async () => {
  const entries = await readdir(CLIENT_DIR, { recursive: true })
  // Styles are asserted separately (they are the only files allowed to carry raw CSS values).
  const files = entries
    .filter(entry => /\.(ts|tsx)$/u.test(entry) && !/(^|[\\/])styles[\\/]/.test(entry) && !/(^|[\\/])styles\.ts$/u.test(entry))
    .sort()
  const parts = await Promise.all(files.map(file => readFile(new URL(file.replaceAll('\\', '/'), CLIENT_DIR), 'utf8')))
  return parts.join('\n')
}

describe('dsh-desk-one 结构', () => {
  it('package.json 应该 声明 bundle / client / exports 三件套', async () => {
    const pkg = await json('package.json')
    assert.equal(pkg.name, '@dsh-sparrow/dsh-desk-one')
    assert.equal(pkg.version, '0.2.2-rc.1')
    assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
    assert.equal(pkg.dsh.client.platform, 'web')
    assert.deepEqual(pkg.dsh.client.inject, [
      '@deepseek-ai/dsh-client-locale',
      '@deepseek-ai/dsh-client-ui-sidebar',
    ])
    assert.equal(pkg.exports['./client'].default, './lib/client.js')
    assert.equal(pkg.publishConfig.access, 'public')
  })

  it('package.json files 应该 覆盖 host 产物且排除 client 散装模块', async () => {
    const pkg = await json('package.json')
    const files = pkg.files
    assert.ok(files.includes('lib/index.js'))
    assert.ok(files.includes('lib/**/*.js'))
    assert.ok(files.includes('!lib/client/**'))
    // 构建产物必须真实存在（verify 的 build 阶段产出）。
    for (const relative of ['lib/index.js', 'lib/host.js', 'lib/model.js', 'lib/trust.js', 'lib/client.js']) {
      assert.ok(existsSync(new URL(`../${relative}`, import.meta.url)), `缺少构建产物 ${relative}`)
    }
    // client 散装模块不进包，只有 bundle 进包：bundle 单独在 files 的否定项之外。
    assert.ok(files.some(entry => entry === '!lib/client/**'))
  })

  it('cordis.patch.yml 应该 按 bundle patch 结构插入 host 行', async () => {
    const patch = await read('cordis.patch.yml')
    assert.match(patch, /- insert:/u)
    assert.match(patch, /id: dsh-desk-one/u)
    assert.match(patch, /name: '@dsh-sparrow\/dsh-desk-one'/u)
  })

  it('存储域 应该 声明 nodes / edges 两张表且布局是 per-record', async () => {
    const { DESK_DOMAIN } = await import('../lib/domain.js')
    assert.equal(DESK_DOMAIN.name, 'desk_one')
    assert.equal(DESK_DOMAIN.layout, 'per-record')
    assert.deepEqual(Object.keys(DESK_DOMAIN.tables).sort(), ['edges', 'nodes'])
  })

  it('client half 应该 只注册官方 main + sidebar.panellist，且用不抛错的能力门', async () => {
    const install = await read('src/client/install.ts')
    const index = await read('src/client/index.ts')
    assert.match(install, /attachMainPanel\(/u)
    assert.match(install, /warnMissingCapabilities\(/u)
    assert.match(install, /ctx\.effect\(\(\) => \(\) => \{ style\.remove\(\) \}/u)
    assert.ok(!/assertCapabilities\(/u.test(install), 'client half 不得用抛错版能力门')
    const gateAt = index.indexOf('passesClientGate(ctx)')
    const installAt = index.indexOf('installDeskClient(ctx')
    assert.ok(gateAt > 0, 'client 入口 apply 必须先跑能力门')
    assert.ok(installAt > gateAt, '能力门必须排在安装之前')
  })

  it('便签墙 应该 有垃圾桶：卡片可丢进垃圾桶，入口与「＋」成组，可恢复 / 永久删除', async () => {
    const page = await readClientSurface()
    const styles = await readStyles()
    assert.match(page, /dsh-desk-trash/u, '要有垃圾桶视图容器')
    assert.match(page, /action\.restore/u, '垃圾桶要能恢复')
    assert.match(page, /action\.clearTrash/u, '垃圾桶要能由用户显式清空')
    assert.match(page, /trash\.empty/u, '垃圾桶要有空态文案')
    assert.match(page, /dsh-desk-fabstack/u, '垃圾桶入口与「＋」成组')
    assert.match(page, /dsh-desk-fab-secondary/u)
    // owner 2026-11-06：垃圾桶相关操作一律用图标，不写文字按钮。
    const iconButtons = page.match(/dsh-desk-iconbtn/gu) ?? []
    assert.ok(iconButtons.length >= 3, '贴纸删除 / 恢复 / 永久删除都应是图标按钮')
    assert.ok(!/dsh-desk-wallbar/u.test(page), '不再有右上角单独的文字入口')
    assert.ok(!/dsh-desk-archive|dsh-desk-note-archive|dsh-desk-link/u.test(page), '不得残留归档语义或文字按钮')
    const iconRule = /\.dsh-desk-iconbtn \{([^}]*)\}/u.exec(styles)
    assert.ok(iconRule !== null, '缺 .dsh-desk-iconbtn 规则')
    assert.match(iconRule[1], /--dsw-radius-sm/u, '图标按钮圆角用宿主 token')
  })

  it('容量与止损：墙上限 100 / 垃圾桶限 200 / 分页 20 / Smash / 无角标', async () => {
    const page = await readClientSurface()
    const styles = await readStyles()
    const constants = await read('src/constants.ts')
    const store = await read('src/host/store.ts')
    const tools = await read('src/host/notes/tools.ts')
    const i18n = await read('src/client/i18n.ts')
    // 产品硬上限（owner 2026-11-06）：便签墙是轻笔记，100 张已超出注意力上限。
    assert.match(constants, /MAX_ACTIVE_NOTES = 100/u, '墙上限 100')
    assert.match(constants, /MAX_TRASH_NOTES = 200/u, '垃圾桶上限 200')
    assert.match(constants, /TRASH_PAGE_SIZE = 10/u, '垃圾桶分页 10')
    assert.match(page, /MAX_ACTIVE_NOTES/u, '客户端要挡墙上限')
    assert.match(page, /wall\.full/u, '墙上限要有友好提示')
    assert.match(i18n, /便签太多了，请先清理一下吧/u, '墙上限提示文案按 owner 口径')
    assert.match(page, /trash\.full/u, '垃圾桶满了要提示先清空')
    assert.match(page, /action\.loadMore/u, '垃圾桶要能加载更多')
    // Smash：与另外两个悬浮按钮同排、同款玻璃、图标常驻（无文字）。
    assert.match(page, /dsh-desk-smash dsh-desk-fabglass/u, 'Smash 要和其他悬浮按钮同款玻璃')
    assert.match(page, /dsh-desk-smash dsh-desk-fabglass[\s\S]{0,400}<svg/u, 'Smash 用图标而不是文字')
    assert.ok(!/!\s*showTrash\s*&&\s*activeNotes\.length > 0/u.test(page), 'Smash 要常驻，不随墙上是否有便签显隐')
    assert.match(page, /trashingIds/u, '单张贴纸删除也要播同一段飞散动画')
    assert.match(page, /ids\.has\(item\.id\)/u, 'Smash 要先乐观清墙再落库（修闪回）')
    assert.match(styles, /dsh-desk-note-smashing/u, 'Smash 要有飞散动画')
    // 入口分组与语义（owner 2026-11-06）：＋ / Smash 是墙面操作，垃圾桶入口用分隔线隔开并说明是“打开”。
    assert.match(page, /dsh-desk-fab-divider/u, '墙面操作与垃圾桶导航之间要有分隔线')
    assert.match(page, /action\.openTrash/u, '垃圾桶入口提示要是“打开垃圾桶”')
    assert.ok(
      page.indexOf('dsh-desk-smash dsh-desk-fabglass') < page.indexOf('dsh-desk-fab-secondary dsh-desk-fabglass'),
      '＋ / Smash 属于墙面操作，应排在垃圾桶入口之前',
    )
    assert.match(page, /closest\('\.dsh-desk-smash'\)/u, 'Smash 确认态点击旁边要恢复（排除按钮自身）')
    assert.match(page, /addEventListener\('pointerdown', onPointerDown, true\)/u, '要用捕获阶段的 pointerdown 监听取消')
    assert.match(page, /Escape/u, 'Esc 也要能取消 Smash 确认')
    // owner 2026-11-06：Smash 图标常驻红色，＋ 是蓝色、垃圾桶是中性色，靠颜色 + 分隔线区分。
    const smashColorRule = /\.dsh-desk-smash \{[^}]*\}/u.exec(styles)
    assert.ok(smashColorRule !== null, '缺 .dsh-desk-smash 颜色规则')
    assert.match(smashColorRule[0], /--dsw-alias-state-error-primary/u, 'Smash 图标要常驻危险色')
    // 角标只留给未读：垃圾桶计数不再挂 badge。
    assert.ok(!/fab-count/u.test(page), '垃圾桶不得再挂角标')
    assert.ok(!/dsh-desk-fab-count/u.test(styles), '角标样式要删干净')
    // host 侧同样校验，agent 工具也绕不过容量上限；列表工具要限流。
    assert.match(store, /MAX_ACTIVE_NOTES/u, 'host 侧也要挡墙上限')
    assert.match(store, /MAX_TRASH_NOTES/u, 'host 侧也要挡垃圾桶上限')
    assert.match(tools, /default 50/u, '列表工具默认限 50 条')
    assert.match(tools, /include_trashed/u, '列表工具要能选择是否包含垃圾桶')
  })

  it('任务板数据层 应该 与便签共享 nodes 表，并挂到 router / tools', async () => {
    const constants = await read('src/constants.ts')
    const contract = await read('src/contract.ts')
    const domain = await read('src/domain.ts')
    const router = await read('src/host/router.ts')
    const store = await read('src/host/store.ts')
    const taskRoutes = await read('src/host/tasks/routes.ts')
    const taskTools = await read('src/host/tasks/tools.ts')
    const index = await read('src/index.ts')
    assert.match(constants, /TASK_STATUSES = \['todo', 'doing', 'done'\]/u, '任务固定三泳道')
    assert.match(constants, /tasks: `\$\{PREFIX\}\/tasks`/u, '任务路由前缀')
    assert.match(contract, /interface DeskTask/u)
    assert.match(contract, /export type DeskNode = DeskNote \| DeskTask/u, '统一对象是 kind 判别联合')
    assert.match(domain, /z\.literal\('task'\)/u, 'nodes 表 schema 扩 task')
    assert.match(domain, /z\.discriminatedUnion\('kind'/u, '按 kind 判别读取')
    assert.match(router, /TASK_ROUTES/u, 'router 要挂任务路由')
    assert.match(store, /async createTask/u)
    assert.match(store, /async updateTask/u)
    assert.match(store, /listTasks/u)
    assert.match(taskRoutes, /TASK_ROUTES/u)
    for (const name of ['desk_task_add', 'desk_task_list', 'desk_task_update', 'desk_task_complete', 'desk_task_archive']) {
      assert.match(taskTools, new RegExp(name, 'u'), `缺工具 ${name}`)
    }
    assert.match(index, /createTaskRecord/u, '任务纯逻辑要从包入口导出')
    const spec = await read('docs/spec/03-task-board.md')
    assert.match(spec, /存档/u, '完成列的语义叫「存档」')
    assert.ok(!spec.includes('「归档」'), '不得再叫「归档」')
    assert.ok(!spec.includes('命名待定'), '命名已定为「存档」')
  })

  it('墙面尺寸 应该 挂载即测 + 手势时读实时尺寸（防止便签被夹到左上角）', async () => {
    const layout = await read('src/client/notes/hooks/useWallLayout.ts')
    const drag = await read('src/client/notes/hooks/useNoteDrag.ts')
    const page = await readClientSurface()
    assert.match(layout, /const setWallRef = useCallback/u, '要用 callback ref 在挂载时立即测量')
    assert.match(layout, /setWallSize\(measureWall\(node\)\)/u, '挂载后立刻记录尺寸')
    assert.match(layout, /new ResizeObserver/u, 'ResizeObserver 继续跟进窗口 / 面板尺寸')
    assert.match(layout, /wallSize\.width === 0 \? rawX/u, '未测量时保留原坐标，不夹到 0')
    assert.match(drag, /const liveSize = useCallback/u, '拖拽要读实时尺寸')
    assert.match(drag, /const size = liveSize\(\)/u)
    assert.match(page, /ref=\{setWallRef\}/u, '墙面要挂到 callback ref 上')
  })

  it('总览 应该 保持空白占位（内容未设计前不堆放功能）', async () => {
    const page = await readClientSurface()
    assert.match(page, /dsh-desk-overview/u, '总览要有空白占位容器')
    assert.ok(!/overview\.(counts|recent|recentEmpty|hint)/u.test(page), '总览不得出现未定稿的内容区块')
  })

  it('便签标签 应该是「满墙贴纸」而非登记表：墙面 + 悬浮「+」+ 可拖动贴纸', async () => {
    const page = await readClientSurface()
    const styles = await readStyles()
    // 墙面容器与悬浮「+」按钮（不是工具栏里的「新建」表单）。
    assert.match(page, /dsh-desk-wall/u)
    assert.match(page, /dsh-desk-add/u)
    assert.match(page, /onPointerDown/u, '贴纸必须支持指针拖拽')
    const addRule = /\.dsh-desk-add \{([^}]*)\}/u.exec(styles)
    assert.ok(addRule !== null, '缺 .dsh-desk-add 规则')
    assert.match(addRule[1], /--dsw-alias-brand-primary-new-colorprimary-new-color/u, '＋ 图标用宿主官方蓝紫品牌色')
    const glassRule = /\.dsh-desk-fabglass \{([^}]*)\}/u.exec(styles)
    assert.ok(glassRule !== null, '缺 .dsh-desk-fabglass 规则')
    assert.match(glassRule[1], /backdrop-filter:\s*blur\(8px\)/u, '小玻璃的模糊半径要继续收小（8px）')
    assert.match(glassRule[1], /-webkit-backdrop-filter/u, '玻璃要补 WebKit 前缀')
    assert.match(glassRule[1], /background-color:\s*color-mix\(/u, '玻璃底是半透明 color-mix')
    // owner 2026-11-06：打光方向要和 theme-tone 输入框一致，但厚度按小面积继续收细，且不要实边。
    assert.match(glassRule[1], /border:\s*none/u, '不要 1px 实边（会显厚），改用发丝边')
    assert.match(glassRule[1], /inset 0 0 0 var\(--dsh-hairline-width/u, '发丝边用宿主的 0.5px token')
    assert.match(glassRule[1], /inset 1px 1px 1px/u, '定向边光要从左上打过来（与输入框一致）')
    assert.match(glassRule[1], /radial-gradient\(ellipse 52% 1\.5px at 50% 0/u, '四边中段亮芯厚度要收细（1.5px）')
    assert.match(glassRule[1], /width:\s*48px/u, '「＋」与垃圾桶同尺寸')
    assert.match(glassRule[1], /--dsw-radius-lg/u, '两者圆角 token 一致')
    assert.ok(!/background-color:\s*var\(--dsw-alias-bg-layer-1/u.test(addRule[1]), '不得退回实底按钮')
    const stackRule = /\.dsh-desk-fabstack \{([^}]*)\}/u.exec(styles)
    assert.ok(stackRule !== null, '缺 .dsh-desk-fabstack 规则')
    assert.match(stackRule[1], /position:\s*absolute/u, '悬浮操作组固定在底部')
    assert.match(stackRule[1], /left:\s*50%/u, '悬浮操作组放到底部中央')
    assert.match(stackRule[1], /transform:\s*translateX\(-50%\)/u, '底部居中要水平回拉一半')
    assert.match(stackRule[1], /flex-direction:\s*column/u, '按钮一排 + Smash 在下方，纵向排列')
    const fabRowRule = /\.dsh-desk-fabrow \{([^}]*)\}/u.exec(styles)
    assert.ok(fabRowRule !== null, '缺 .dsh-desk-fabrow 规则')
    assert.match(fabRowRule[1], /flex-direction:\s*row/u, '垃圾桶与「＋」必须同一排')
    // 悬浮组不能被内容列限宽规则套上 width:100%（否则右定位会被推到左边）。
    assert.match(styles, /\.dsh-desk-page > :not\(\.dsh-desk-fabstack\)/u, '内容列限宽要排除悬浮操作组')
    // owner 2026-11-06：＋ 在左、垃圾桶在右。
    assert.ok(
      page.indexOf('dsh-desk-add dsh-desk-fabglass') < page.indexOf('dsh-desk-fab-secondary dsh-desk-fabglass'),
      '「＋」应排在垃圾桶前面（视觉上在左）',
    )
    // 贴纸图标用深墨色，不依赖主题的前景色（light 主题下也清晰）。
    const actionRule = /\.dsh-desk-note-action \{([^}]*)\}/u.exec(styles)
    assert.ok(actionRule !== null, '缺 .dsh-desk-note-action 规则')
    assert.match(actionRule[1], /color:\s*rgba\(55, 53, 47/u, '贴纸图标要用纸面墨色（不随主题变白）')
    // owner 2026-11-06：垃圾桶图标要够大，不要缩成黑疙瘩。
    const smIconRule = /\.dsh-desk-iconbtn-sm svg \{([^}]*)\}/u.exec(styles)
    assert.ok(smIconRule !== null, '缺贴纸小图标尺寸规则')
    assert.match(smIconRule[1], /width:\s*20px/u, '贴纸垃圾桶图标至少 20px')
    const fabIconRule = /\.dsh-desk-fab-secondary svg \{([^}]*)\}/u.exec(styles)
    assert.ok(fabIconRule !== null, '缺底部垃圾桶图标尺寸规则')
    assert.match(fabIconRule[1], /width:\s*22px/u, '底部垃圾桶图标至少 22px')
    // 贴纸不出屏：墙面不滚动，不得再有可滚动画布。
    const wallRule = /\.dsh-desk-wall \{([^}]*)\}/u.exec(styles)
    assert.ok(wallRule !== null, '缺 .dsh-desk-wall 规则')
    assert.match(wallRule[1], /overflow:\s*hidden/u, '墙面必须裁切不滚动（贴纸一律夹在可见区域内）')
    // owner 2026-11-06：不要背板（显脏且缩小操作面积）；双击空白新建 + 淡提示保留。
    assert.ok(!/border:\s*1px/u.test(wallRule[1]), '墙面不得再加背板边框')
    assert.ok(!/background:/u.test(wallRule[1]), '墙面不得再加背板底色')
    assert.match(page, /onDoubleClick/u, '便签墙要支持双击空白处新建')
    assert.match(page, /wall\.tip/u, '空墙中央要有双击新建提示')
    assert.match(page, /z:\s*layer/u, '新建便签要带层级（默认置顶）')
    assert.match(page, /note\.z !== layer/u, '新建便签要对不认创建 z 的宿主做兜底（本地置顶 + 补丁落库）')
    // owner 2026-11-06：不必为悬浮按钮预留空白，贴纸可铺满；按钮永远在贴纸之上。
    const notesviewRule = /\.dsh-desk-notesview \{([^}]*)\}/u.exec(styles)
    assert.ok(notesviewRule !== null, '缺 .dsh-desk-notesview 规则')
    assert.ok(!/padding-bottom/u.test(notesviewRule[1]), '不得为悬浮按钮预留空白（贴纸要能铺满）')
    assert.match(wallRule[1], /z-index:\s*0/u, '墙面要建立层级上下文，按钮才能永远盖住贴纸')
    const tipRule = /\.dsh-desk-wall-tip-main \{([^}]*)\}/u.exec(styles)
    assert.ok(tipRule !== null, '缺提示主文案样式')
    assert.match(tipRule[1], /letter-spacing/u, '提示文案要有排版设计（字距）')
    assert.match(tipRule[1], /color-mix\(/u, '提示颜色要压到很浅（color-mix 透明度）')
    assert.ok(!/dsh-desk-canvas/u.test(page), '不得再有可滚动的画布容器')
    // 真实便签是方角纸片，不是大圆角卡片。
    const noteRule = /\.dsh-desk-note \{([^}]*)\}/u.exec(styles)
    assert.ok(noteRule !== null, '缺 .dsh-desk-note 规则')
    assert.match(noteRule[1], /border-radius:\s*2px/u, '便签必须是方角纸片（2px）')
    assert.ok(!/border-radius:\s*10px/u.test(noteRule[1]), '便签不得回到 10px 大圆角')
    // 改大小手柄 + 层级置顶 + 标签页记忆都在页面里。
    assert.match(page, /dsh-desk-note-resize/u, '便签必须有右下角改大小手柄')
    assert.match(page, /dsh-desk-note-grip/u, '便签必须有紧凑的六点抓握纹')
    assert.match(page, /action\.drag/u, '抓握纹要带可访问文案')
    const gripRule = /\.dsh-desk-note-grip \{([^}]*)\}/u.exec(styles)
    assert.ok(gripRule !== null, '缺 .dsh-desk-note-grip 规则')
    assert.match(gripRule[1], /grid-template-columns:\s*repeat\(2,\s*2px\)/u, '六点纹要紧凑（2px 点 / 2px 间距）')
    assert.match(gripRule[1], /gap:\s*2px/u)
    // 配色分层（owner 2026-11-06）：深色小色标负责色相，纸面取同色相但浅一档的中等深度。
    const linearChannel = (channel) => {
      const value = channel / 255
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    }
    const luminance = (hex) => {
      const red = linearChannel(parseInt(hex.slice(1, 3), 16))
      const green = linearChannel(parseInt(hex.slice(3, 5), 16))
      const blue = linearChannel(parseInt(hex.slice(5, 7), 16))
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue
    }
    const notePalette = new Map([...styles.matchAll(/\.dsh-desk-note\[data-color='([a-z]+)'\] \{ background-color: (#[0-9a-f]{6}); \}/gu)].map(match => [match[1], match[2]]))
    const dotPalette = new Map([...styles.matchAll(/\.dsh-desk-dot\[data-color='([a-z]+)'\] \{ background: (#[0-9a-f]{6}); \}/gu)].map(match => [match[1], match[2]]))
    assert.equal(notePalette.size, 5, '便签色板应有 5 个色位')
    for (const [color, paper] of notePalette) {
      assert.ok(dotPalette.has(color), `色板缺 ${color}`)
      assert.ok(luminance(paper) < 0.85, `纸面 ${color} 不能太浅（要向色标靠拢）`)
      assert.ok(luminance(paper) > luminance(dotPalette.get(color)), `纸面 ${color} 应比色标浅一档`)
    }
    // 真实便签是平涂纸面：不得有渐变（owner 2026-11-06 明确否掉）。
    assert.ok(!/gradient/u.test(noteRule[1]), '便签纸面不得有渐变')
    // 改大小角标是极简角标，不是斜线花纹。
    const resizeRule = /\.dsh-desk-note-resize \{([^}]*)\}/u.exec(styles)
    assert.ok(resizeRule !== null, '缺 .dsh-desk-note-resize 规则')
    assert.match(resizeRule[1], /width:\s*26px/u, '改大小热区要够大（26px）')
    assert.match(resizeRule[1], /height:\s*26px/u, '改大小热区要够大（26px）')
    const resizeVisual = /\.dsh-desk-note-resize::after \{([^}]*)\}/u.exec(styles)
    assert.ok(resizeVisual !== null, '缺改大小角标（伪元素）规则')
    assert.match(resizeVisual[1], /border-right/u, '改大小用右下角角标（border-right/bottom）')
    assert.ok(!/gradient/u.test(resizeVisual[1]), '改大小角标不得用斜线花纹')
    assert.match(page, /zIndex/u, '点/拖哪张就置顶需要 zIndex')
    assert.match(page, /TAB_STORAGE_KEY/u, '上次停留的标签页要记住')
    assert.match(page, /localStorage/u)
    // 贴纸直接在墙上写字（textarea），不搞标题/保存按钮的登记表。
    assert.match(page, /dsh-desk-note-body/u)
    assert.ok(!/action\.save/u.test(page), '便签墙不得再有「保存」按钮（失焦即保存）')
    assert.ok(!/placeholder\.title/u.test(page), '便签墙不得再有标题输入框')
    assert.ok(!/dsh-desk-composer/u.test(styles), '登记表式编辑器样式应已删除')
  })

  it('任务板客户端 应该 三泳道 + 卡片交互 + 拖拽 + 排序视图 + 存档', async () => {
    const page = await readClientSurface()
    const board = await read('src/client/tasks/components/TaskBoard.tsx')
    const column = await read('src/client/tasks/components/TaskColumn.tsx')
    const card = await read('src/client/tasks/components/TaskCard.tsx')
    const types = await read('src/client/tasks/types.ts')
    const index = await read('src/client/index.ts')
    const install = await read('src/client/install.ts')
    const styles = await readStyles()
    assert.match(page, /tab\.tasks/u)
    assert.match(page, /TaskBoard/u, '页面要挂任务板')
    assert.match(board, /TASK_LANE_ORDER\.map/u, '固定三泳道')
    assert.match(types, /groupLanes/u)
    assert.match(types, /'created'/u, '排序视图：创建时间')
    assert.match(types, /'due'/u, '排序视图：截止日期')
    assert.match(board, /data-lane/u, '拖拽落点用 data-lane')
    assert.match(board, /elementFromPoint/u, '指针拖拽按落点判定泳道')
    assert.match(board, /board\.moveTask/u, '拖拽要触发 moveTask')
    assert.match(board, /dsh-task-ghost/u, '拖拽要有跟随鼠标的幽灵卡')
    assert.match(board, /flyBack/u, '拖到无效位置要弹回原位')
    assert.match(column, /onDoubleClick/u, '泳道双击可新建卡片')
    assert.match(column, /data-group-id/u, '分组是拖拽落点')
    assert.match(column, /countText/u, '计数要显示成「3 项 / 3 tasks」而不是裸数字')
    assert.match(column, /dsh-task-group/u, '一层分组渲染')
    assert.match(card, /canArchive = task\.status === 'done'/u, '只有完成列可存档')
    assert.match(card, /dsh-task-body/u, '卡片有正文输入')
    assert.match(card, /autoGrow/u, '标题 / 正文要自动换行')
    assert.match(card, /data-due-soon/u, '截止只剩一天要有提醒')
    assert.match(card, /type="date"/u, '卡片可编辑截止日期')
    assert.match(card, /data-confirm/u, '删除二次确认')
    assert.match(index, /taskApi\.listTasks/u, '客户端要注入任务数据面')
    assert.match(install, /listTasks/u)
    assert.match(styles, /\.dsh-task-lane \{/u)
    assert.match(styles, /\.dsh-task-card \{/u)
    assert.match(styles, /\.dsh-task-ghost \{/u)
    assert.match(styles, /data-due-soon/u)
    assert.match(styles, /\.dsh-task-group-head \{/u)
  })

  it('任务板 应该 无横向滚动条：窄宽度收成计数模式，分组可拖动排序', async () => {
    const board = await read('src/client/tasks/components/TaskBoard.tsx')
    const column = await read('src/client/tasks/components/TaskColumn.tsx')
    const styles = await readStyles()
    const notesStyles = await read('src/client/notes/styles.ts')
    const notesDrag = await read('src/client/notes/hooks/useNoteDrag.ts')
    // No horizontal scrollbar; the compact threshold takes over instead.
    assert.match(styles, /\.dsh-task-lanes \{[^}]*overflow: hidden/su)
    assert.match(styles, /\.dsh-task-list \{[^}]*scrollbar-width: none/su, '内部滚动条隐藏但可滚动')
    assert.match(board, /TASK_BOARD_COMPACT_WIDTH/u)
    assert.match(board, /data-compact=\{compact\}/u)
    assert.match(column, /data-compact="true"/u, '紧凑泳道只显示计数')
    assert.match(column, /dsh-task-compact-row/u)
    assert.match(styles, /\.dsh-task-compact-row \{/u)
    // Group headers drag with the same pointer gesture as cards.
    assert.match(column, /onGroupStartDrag/u, '整组拖拽走指针手势')
    assert.match(column, /dsh-task-group-grip/u, '分组要有拖动手柄')
    assert.match(board, /dsh-task-group-ghost/u, '整组拖动有跟随鼠标的整组幽灵')
    assert.match(board, /resolveGroupDrop/u, '整组落点按泳道 + 分组序号解析')
    // Task ghost is straight; the sticky-note drag gets the paper tilt instead.
    assert.ok(!/\.dsh-task-ghost \{[^}]*rotate/su.test(styles), '任务幽灵卡不要倾斜')
    assert.match(notesStyles, /\.dsh-desk-note\[data-dragging='true'\] \{[^}]*rotate/su)
    assert.match(notesDrag, /dataset\.dragging = 'true'/u)
  })

  it('分组 应该 是宿主实体（REST + 工具 + 客户端），不是 localStorage 标签', async () => {
    const contract = await read('src/contract.ts')
    const domain = await read('src/domain.ts')
    const store = await read('src/host/store.ts')
    const groupRoutes = await read('src/host/tasks/group-routes.ts')
    const groupTools = await read('src/host/tasks/group-tools.ts')
    const host = await read('src/host.ts')
    const api = await read('src/client/tasks/api.ts')
    const groupsHook = await read('src/client/tasks/hooks/useGroupsData.ts')
    const boardHook = await read('src/client/tasks/hooks/useTaskBoard.ts')
    const board = await read('src/client/tasks/components/TaskBoard.tsx')
    const styles = await readStyles()
    assert.match(contract, /export interface DeskTaskGroup/u, '分组是独立对象')
    assert.match(contract, /groupId\?: string/u, '任务用 groupId 记录成员关系')
    assert.match(domain, /kind: z\.literal\('group'\)/u, 'nodes 表扩 group kind')
    assert.match(store, /async moveGroup/u, '整组跨列由 host 级联状态')
    assert.match(store, /async deleteGroup/u, '删组由 host 把成员解绑')
    assert.match(groupRoutes, /ROUTES\.groupMove/u)
    assert.match(groupTools, /desk_group_move/u)
    assert.match(host, /registerGroupTools/u)
    assert.match(api, /export function listGroups/u)
    assert.match(groupsHook, /useGroupsData/u)
    assert.match(boardHook, /removeItem\(TASK_GROUPS_STORAGE_KEY\)/u, '旧的 localStorage 分组列表要清掉')
    assert.match(boardHook, /task\.status === toStatus/u, '拖拽只重排目标容器')
    assert.match(board, /resolveGroupDrop/u, '整组落点按泳道 + 分组序号解析')
    assert.match(board, /onGroupStartDrag/u, '整组拖拽和卡片一样走指针手势')
    assert.match(board, /moveGroupWhole/u, '跨泳道直接移动整组，不再有确认条')
    assert.match(boardHook, /const moveGroupWhole = useCallback/u)
    assert.match(boardHook, /const reorderGroup = useCallback/u)
    assert.ok(!styles.includes('.dsh-task-movebar'), '整组移动不需要确认条 / 撤销条')
    assert.ok(!styles.includes('.dsh-task-group-dragimage'), '不再使用 HTML5 拖影')
  })

  it('页面 应该 用一个面板承载标签页，而不是弹窗', async () => {
    const page = await readClientSurface()
    assert.match(page, /dsh-desk-tabs/u)
    assert.match(page, /data-window-drag/u)
    assert.match(page, /'overview'/u)
    assert.match(page, /'notes'/u)
    assert.match(page, /'tasks'/u)
    for (const forbidden of ['role="dialog"', 'aria-modal', 'position: fixed', 'backdrop-filter']) {
      assert.ok(!page.includes(forbidden), `页面源码里不该有 ${forbidden}`)
    }
  })

  it('页面根 应该 显式 14px 基准字号（中央列不提供基准）', async () => {
    const styles = await readStyles()
    const root = /\.dsh-desk-page \{([^}]*)\}/u.exec(styles)
    assert.ok(root !== null, '缺 .dsh-desk-page 规则')
    const decl = root[1].replace(/\/\*[\s\S]*?\*\//gu, '')
    assert.match(decl, /font-size:\s*14px/u)
  })

  it('locale 字典 应该 中英键集一一对应，且 locale.d.ts 覆盖全部键', async () => {
    const i18n = await read('src/client/i18n.ts')
    const dict = await read('src/client/locale.d.ts')
    const keysOf = (lang) => {
      const start = i18n.indexOf(`  ${lang}: {`)
      assert.ok(start >= 0, `找不到 ${lang} 字典块`)
      const end = i18n.indexOf('\n  },', start)
      assert.ok(end > start, `${lang} 字典块没有闭合`)
      return [...i18n.slice(start, end).matchAll(/^\s*'([^']+)':/gmu)].map(match => match[1])
    }
    const zh = keysOf('zh')
    const en = keysOf('en')
    assert.ok(zh.length > 0)
    assert.deepEqual(zh.filter(key => !en.includes(key)), [], 'zh 有而 en 没有的键')
    assert.deepEqual(en.filter(key => !zh.includes(key)), [], 'en 有而 zh 没有的键')
    for (const key of zh) {
      assert.ok(dict.includes(`'${key}'`), `locale.d.ts 缺键 ${key}`)
    }
  })

  it('文档 应该 中英双份且含官方 dsh 版本要求行', async () => {
    for (const file of ['README.md', 'README.zh-CN.md', 'CHANGELOG.md', 'CHANGELOG.zh-CN.md']) {
      assert.ok(existsSync(new URL(`../${file}`, import.meta.url)), `缺 ${file}`)
    }
    for (const file of ['README.md', 'README.zh-CN.md']) {
      const text = await read(file)
      assert.match(text.split(/\r?\n/u)[0], /^#\s+\S/u, `${file} 第一行不是 H1`)
      assert.ok(/(?:^|\s)dsh\s|dsh\s/iu.test(text.replace(/@dsh-sparrow\//gu, '')), `${file} 缺 dsh 环境要求行`)
      assert.match(text, /0\.2\.2-rc\.1/u, `${file} 环境要求行必须写明 0.2.2-rc.1`)
    }
  })

  it('client bundle 应该 保留 main 与 sidebar.panellist 两处槽位注册', async () => {
    const bundle = await read('lib/client.js')
    assert.ok(bundle.includes('sidebar.panellist'), 'bundle 缺 sidebar.panellist 槽位注册')
    assert.ok(bundle.includes("'main'") || bundle.includes('"main"'), 'bundle 缺 main 槽位注册')
  })

  it('spec 应该 包含已交付的设计文档', async () => {
    const specs = await readdir(new URL('../docs/spec', import.meta.url))
    assert.deepEqual(specs.sort(), ['00-overview.md', '01-object-model.md', '02-modules.md', '03-task-board.md'])
  })
})
