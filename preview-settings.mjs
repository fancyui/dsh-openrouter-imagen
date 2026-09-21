/**
 * Static previews of the plugin's two surfaces, for a visual check without
 * booting DSH: the Settings page and the composer strip + conversation card.
 *
 * Loads the real lib/client.js in a VM, mounts the real components with a tiny
 * hook runtime (effects DO run, so the page shows its loaded state), and emits
 * HTML carrying the plugin's own stylesheet. The theme tokens (`--dsw-alias-*`)
 * do not exist outside the product, so plausible light-theme values are supplied
 * here: these previews are for LAYOUT and SPACING, not colour.
 *
 *   node preview-settings.mjs            # writes preview/settings.html + preview/composer.html
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

/** Project root, derived from this file so the preview runs from any checkout. */
const ROOT = dirname(fileURLToPath(import.meta.url))
const OUT = join(ROOT, 'preview')

let captured = null
let cells = []
let cursor = 0
let effects = []
let dirty = false
const styles = []

const setCell = (index, next) => {
  const value = typeof next === 'function' ? next(cells[index]) : next
  if (value !== cells[index]) {
    cells[index] = value
    dirty = true
  }
}

const React = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  useState: (initial) => {
    const index = cursor
    cursor += 1
    if (!(index in cells)) cells[index] = typeof initial === 'function' ? initial() : initial
    return [cells[index], (next) => setCell(index, next)]
  },
  useEffect: (fn) => {
    const index = cursor
    cursor += 1
    effects[index] = fn
  },
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
}

const CONFIG = {
  model: 'openai/gpt-image-2.5-sunburst',
  resolution: '1K',
  aspectRatio: '1:1',
  quality: 'auto',
  outputFormat: 'webp',
  count: 1,
  background: 'auto',
  seed: '',
  providerSort: 'price',
  extraJson: '',
  saveDir: 'generated-images',
}

const fetchShim = async (url) => {
  const action = String(url).split('/').pop()
  const payload =
    action === 'config'
      ? { ok: true, config: CONFIG, hasKey: true, suggestions: ['openai/gpt-image-2.5-sunburst', 'google/gemini-2.5-flash-image'] }
      : { ok: true, models: [], count: 0 }
  return { status: 200, text: async () => JSON.stringify(payload) }
}

const sandbox = {
  window: { __ModuleLoader__: { load: (definition) => { captured = definition } } },
  document: {
    head: { appendChild: (element) => { if (element && element.id) styles.push(String(element.textContent)) } },
    createElement: () => ({ id: '', textContent: '' }),
    getElementById: () => null,
    addEventListener: () => {},
    removeEventListener: () => {},
  },
  fetch: fetchShim,
  setInterval: () => 0,
  clearInterval: () => {},
  setTimeout,
  console,
}
vm.createContext(sandbox)
vm.runInContext(readFileSync(join(ROOT, 'lib', 'client.js'), 'utf8'), sandbox, { filename: 'client.js' })

const moduleExports = captured.factory((id) => {
  if (id === 'react') return React
  throw new Error(`unexpected require(${id})`)
})

const registered = []
moduleExports.apply({
  effect: (fn) => {
    const dispose = fn()
    return typeof dispose === 'function' ? dispose : () => {}
  },
  slots: {
    inject: (_key, factory) => {
      factory().next()
      return () => {}
    },
    register: (options, component) => {
      registered.push({ options, component })
      return () => {}
    },
  },
})

const settings = registered.find((r) => r.options.name === 'settings.section')
const dockEntry = registered.find((r) => r.options.name === 'conversation.input.dock')
const toggleEntry = registered.find((r) => r.options.name === 'conversation.input.right')
const cardEntry = registered.find((r) => r.options.name === 'tool.call.toolview')
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

const findNode = (node, predicate) => {
  if (node === null || node === undefined || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findNode(child, predicate)
      if (found !== null) return found
    }
    return null
  }
  if (node.type !== undefined) {
    if (predicate(node)) return node
    for (const child of node.children ?? []) {
      const found = findNode(child, predicate)
      if (found !== null) return found
    }
  }
  return null
}

const mountStable = async (Component, props) => {
  cells = []
  let tree = null
  for (let pass = 0; pass < 6; pass += 1) {
    cursor = 0
    effects = []
    dirty = false
    tree = Component(props ?? {})
    const recorded = effects.slice()
    effects = []
    // Every effect here declares `[]` deps, so it runs on the first pass only.
    if (pass === 0) recorded.forEach((fn) => { if (typeof fn === 'function') fn() })
    await tick()
    if (!dirty) return tree
  }
  return tree
}

const VOID = new Set(['input', 'img', 'br', 'hr', 'meta', 'link'])
const escapeHtml = (value) => String(value).replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;')

const renderToHtml = (node) => {
  if (node === null || node === undefined || node === false || node === true) return ''
  if (typeof node === 'string' || typeof node === 'number') return escapeHtml(node)
  if (Array.isArray(node)) return node.map(renderToHtml).join('')
  if (typeof node.type === 'function') return renderToHtml(node.type({ ...node.props, children: node.children }))
  const { type, props, children } = node
  const attrs = []
  for (const [key, value] of Object.entries(props ?? {})) {
    if (key === 'key' || key === 'children' || typeof value === 'function' || value === undefined || value === null) continue
    if (key === 'value') {
      attrs.push(`value="${escapeHtml(value)}"`)
      continue
    }
    if (key === 'defaultValue') continue
    if (typeof value === 'object') continue
    // JSX prop names must become their HTML attribute names or the browser
    // silently drops the styling.
    const name = key === 'className' ? 'class' : key === 'htmlFor' ? 'for' : key
    attrs.push(`${name}="${escapeHtml(value)}"`)
  }
  const open = `<${type}${attrs.length > 0 ? ` ${attrs.join(' ')}` : ''}>`
  if (VOID.has(type)) return open
  return `${open}${(children ?? []).map(renderToHtml).join('')}</${type}>`
}

const TOKENS = `
:root{
  --dsw-alias-label-primary:#171717;
  --dsw-alias-label-secondary:#6b7280;
  --dsw-alias-border-l1:#e5e5e5;
  --dsw-alias-border-l2:#d4d4d4;
  --dsw-alias-bg-base:#ffffff;
  --dsw-alias-bg-layer-1:#fcfcfc;
  --dsw-alias-bg-layer-2:#f4f4f5;
  --dsw-alias-brand-primary:#0b6cff;
  --dsw-alias-state-error-primary:#d92d20;
  --dsw-alias-state-success-primary:#12b76a;
}
body{margin:0;padding:22px 24px 40px;background:#ffffff;color:#171717;
  font-family:"Segoe UI","Microsoft YaHei",system-ui,sans-serif;width:720px;box-sizing:border-box}
`

const html = await mountStable(settings.component)
mkdirSync(OUT, { recursive: true })
writeFileSync(
  `${OUT}/settings.html`,
  `<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n<title>OpenRouter 图像生成 — 设置页预览</title>\n<style>${TOKENS}\n${styles.join('\n')}\n</style>\n</head>\n<body>\n${renderToHtml(html)}\n</body>\n</html>\n`,
  'utf8',
)

/**
 * The composer strip and the conversation card, stacked the way the product
 * stacks them, so the single-row panel and the card's footer can be eyeballed
 * together. The strip is expanded by clicking the real toggle first, which is
 * also what proves the toggle still owns that state.
 */
const toggleTree = await mountStable(toggleEntry.component)
const toggleButton = findNode(toggleTree, (element) => element.type === 'button')
toggleButton?.props?.onClick?.()

const dockTree = await mountStable(dockEntry.component)

/** A stand-in for the bytes the chat node would authorize, so the card has pixels to show. */
const placeholder = `data:image/svg+xml;base64,${Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="816" height="816"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c8d8e8"/><stop offset="1" stop-color="#5a6b7d"/></linearGradient></defs><rect width="816" height="816" fill="url(#g)"/><circle cx="408" cy="330" r="150" fill="#e8e2d8" opacity=".75"/><rect x="150" y="520" width="516" height="220" rx="110" fill="#3f4a58" opacity=".8"/></svg>',
).toString('base64')}`

const dir = join(ROOT, 'generated-images')
const settled = {
  kind: 'tool-call',
  isError: false,
  call: { name: 'openrouter_generate_imagen', argsRaw: JSON.stringify({ prompt: '把这张照片重绘成油画风格' }) },
  content: [
    {
      type: 'text',
      text: `已生成 1 张图片（模型 openai/gpt-image-2.5-sunburst，耗时 32 秒，费用 $0.0149）。\n保存目录：${dir}\n种子：1844679（本次随机）\n文件：${dir}\\openrouter-20260922-020252-1.webp`,
    },
    {
      type: 'image',
      attachment: {
        attachmentId: 'att-preview',
        mediaType: 'image/webp',
        bytes: 688883,
        width: 816,
        height: 816,
        name: 'openrouter-20260922-020252-1.webp',
      },
    },
  ],
}
const cardTree = await mountStable(cardEntry.component, { block: settled, loadImage: async () => placeholder })

writeFileSync(
  `${OUT}/composer.html`,
  `<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n<title>OpenRouter 图像生成 — 对话框与图片卡片预览</title>\n<style>${TOKENS.replace('width:720px', 'width:900px')}\n${styles.join('\n')}\n.composer-mock{margin:18px auto 0;max-width:900px;border:1px solid var(--dsw-alias-border-l1);border-radius:14px;background:var(--dsw-alias-bg-layer-2);padding:12px}\n.composer-mock p{margin:0 0 10px;font-size:12px;color:var(--dsw-alias-label-secondary)}\n.chat-mock{max-width:640px;margin:26px auto 0}\n</style>\n</head>\n<body>\n<div class="composer-mock"><p>对话框上方（「图像」按钮展开后）</p>${renderToHtml(dockTree)}</div>\n<div class="chat-mock"><p>对话里的图片卡片</p>${renderToHtml(cardTree)}</div>\n</body>\n</html>\n`,
  'utf8',
)

console.log(`wrote ${OUT}/settings.html`)
console.log(`sections: ${(renderToHtml(html).match(/class="dsh-oi-sec"/gu) ?? []).length}`)
console.log(`wrote ${OUT}/composer.html`)
console.log(`dock rows: ${(renderToHtml(dockTree).match(/class="dsh-oi-dock-row"/gu) ?? []).length}, controls: ${(renderToHtml(dockTree).match(/<(select|input)/gu) ?? []).length}`)
