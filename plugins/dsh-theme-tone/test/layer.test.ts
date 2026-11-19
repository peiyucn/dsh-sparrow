import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BOOT_OVERLAY_ATTR, LAYER_HOST_ID, bootHandoffPending, ensureBackdropLayer } from '../lib/backdrop.js'
import { MARKER_ATTR } from '../lib/constants.js'

class FakeElement {
  children: FakeElement[] = []
  attributes: Record<string, string> = {}
  classList = {
    values: [] as string[],
    add: (token: string): void => { this.classList.values.push(token) },
  }
  parentElement: FakeElement | null = null

  appendChild(child: FakeElement): FakeElement {
    child.parentElement = this
    this.children.push(child)
    return child
  }

  prepend(child: FakeElement): FakeElement {
    child.parentElement = this
    this.children.unshift(child)
    return child
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value
  }

  remove(): void {
    if (this.parentElement === null) return
    const siblings = this.parentElement.children
    const index = siblings.indexOf(this)
    if (index >= 0) siblings.splice(index, 1)
    this.parentElement = null
  }
}

function findByAttribute(nodes: FakeElement[], attribute: string): FakeElement | null {
  for (const node of nodes) {
    if (attribute in node.attributes) return node
    const found = findByAttribute(node.children, attribute)
    if (found !== null) return found
  }
  return null
}

class FakeDocument {
  body = new FakeElement()
  root = new FakeElement()
  created: FakeElement[] = []
  hasRoot = false

  getElementById(id: string): FakeElement | null {
    return this.hasRoot && id === LAYER_HOST_ID ? this.root : null
  }

  createElement(): FakeElement {
    const element = new FakeElement()
    this.created.push(element)
    return element
  }

  querySelector(selector: string): FakeElement | null {
    if (selector.includes(BOOT_OVERLAY_ATTR)) return findByAttribute([this.root, this.body], BOOT_OVERLAY_ATTR)
    if (selector.includes(MARKER_ATTR)) return findByAttribute([this.root, this.body], MARKER_ATTR)
    return null
  }
}

function makeDocument(hasRoot: boolean): FakeDocument {
  const doc = new FakeDocument()
  doc.hasRoot = hasRoot
  return doc
}

function addBootOverlay(doc: FakeDocument): FakeElement {
  const overlay = new FakeElement()
  overlay.setAttribute(BOOT_OVERLAY_ATTR, '')
  doc.root.appendChild(overlay)
  return overlay
}

describe('backdrop: 装饰层挂载点（macOS 窗口拖动回归）', () => {
  it('宿主有 #root 时挂进 #root 内，不挂成 body 直系节点', () => {
    const doc = makeDocument(true)
    const layer = ensureBackdropLayer(doc as unknown as Document)

    assert.equal(layer.parentElement, doc.root, '装饰层必须挂进 #root')
    assert.equal(doc.body.children.length, 0, 'body 直系不得出现装饰层')
    assert.equal(doc.root.children[0], layer, '挂进 #root 后仍在内容之前')
    assert.deepEqual(doc.root.children, [layer])
  })

  it('没有 #root 的独立页面回退 body（非宿主环境保持原行为）', () => {
    const doc = makeDocument(false)
    const layer = ensureBackdropLayer(doc as unknown as Document)

    assert.equal(layer.parentElement, doc.body)
    assert.deepEqual(doc.body.children, [layer])
  })

  it('热重载残留的 body 直系旧层被搬进 #root（刷新前也不能继续锁窗口）', () => {
    const doc = makeDocument(true)
    const stale = new FakeElement()
    stale.setAttribute(MARKER_ATTR, '')
    doc.body.appendChild(stale)
    doc.created.push(stale)

    const layer = ensureBackdropLayer(doc as unknown as Document)

    assert.equal(layer, stale, '复用旧层而不是另建一份')
    assert.equal(stale.parentElement, doc.root, '旧层必须搬进 #root')
    assert.equal(doc.body.children.length, 0, 'body 直系不再有全屏装饰层')
  })

  it('重复调用复用同一个层，不重复建 DOM', () => {
    const doc = makeDocument(true)
    const first = ensureBackdropLayer(doc as unknown as Document)
    const second = ensureBackdropLayer(doc as unknown as Document)

    assert.equal(first, second)
    assert.equal(doc.created.length, 1)
    assert.equal(doc.root.children.length, 1)
  })
})

describe('backdrop: 客户端 boot 交接（装饰层不得插入 hydrate 的 #root 子序）', () => {
  it('boot overlay 还挂在 #root 时，装饰层先放 body，等交接完成再搬进 #root', () => {
    const doc = makeDocument(true)
    const overlay = addBootOverlay(doc)

    assert.equal(bootHandoffPending(doc as unknown as Document), true, 'boot overlay 存在时交接未完成')
    const layer = ensureBackdropLayer(doc as unknown as Document)

    assert.equal(layer.parentElement, doc.body, '交接期间不得插入 #root（会抢 boot overlay 的 hydrate 位置）')
    assert.deepEqual(doc.root.children, [overlay], '#root 子序保持 boot overlay 唯一')

    overlay.remove()
    assert.equal(bootHandoffPending(doc as unknown as Document), false, 'overlay 移除后交接完成')

    const moved = ensureBackdropLayer(doc as unknown as Document)

    assert.equal(moved, layer, '交接完成复用同一层')
    assert.equal(layer.parentElement, doc.root, '交接完成后搬进 #root')
    assert.equal(doc.body.children.length, 0, 'body 直系不再有装饰层')
  })

  it('boot overlay 不在 #root 直系时不算交接中，直接挂 #root', () => {
    const doc = makeDocument(true)
    const overlay = new FakeElement()
    overlay.setAttribute(BOOT_OVERLAY_ATTR, '')
    doc.body.appendChild(overlay)

    assert.equal(bootHandoffPending(doc as unknown as Document), false, '非 #root 直系的 boot 节点不阻塞')
    const layer = ensureBackdropLayer(doc as unknown as Document)

    assert.equal(layer.parentElement, doc.root, '#root 子序没有被 boot overlay 占用，直接挂进 #root')
    assert.deepEqual(doc.root.children, [layer])
  })

  it('没有 #root 时不存在 boot 交接，按独立页面回退 body', () => {
    const doc = makeDocument(false)
    assert.equal(bootHandoffPending(doc as unknown as Document), false)
  })
})
