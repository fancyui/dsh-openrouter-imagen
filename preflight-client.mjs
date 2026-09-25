/**
 * Pre-flight harness for dsh-openrouter-imagen's Client half.
 *
 * Loads lib/client.js the way the browser module system does — through
 * `window.__ModuleLoader__.load({ id, factory })` — then checks the plugin
 * shape, the slot registration, and that every registered component actually
 * renders a tree without throwing, which is the failure mode a hand-written
 * client half is most likely to hit.
 *
 * The React shim below is deliberately tiny but not fake: `useState` really
 * re-renders the next pass and `useEffect` really runs, because the tool card's
 * image loader resolves asynchronously and a no-op effect would hide exactly the
 * bug worth catching. `fetch` is shimmed too, so the card's "open this folder"
 * button is asserted against the real request it makes.
 */
import { readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

/** Project root, derived from this file so the harness runs from any checkout. */
const ROOT = dirname(fileURLToPath(import.meta.url))
/** Both separators accepted, metacharacters escaped — for paths asserted as regexes. */
const rootPattern = ROOT.split(/[\\/]/u)
  .map((part) => part.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'))
  .join('[\\\\/]')
/** The drive letter as the client half lowercases it. */
const rootDrive = `${(ROOT[0] ?? 'X').toLowerCase()}:`

let captured = null

/** Hook storage for the current mount; reset by `mount`. */
let cells = []
let cursor = 0
let effects = []
let dirty = false

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

const listeners = new Map()
/** Minimal DOM: enough for installStyles and the capture-phase paste listener. */
const documentShim = {
  head: { appendChild: () => {} },
  createElement: () => ({ id: '', textContent: '' }),
  getElementById: () => null,
  addEventListener: (type, fn) => {
    listeners.set(type, fn)
  },
  removeEventListener: (type) => {
    listeners.delete(type)
  },
}

/** The settings payload every component loads; also the shape the Host serves. */
const dockConfig = {
  model: 'openai/gpt-image-2.5-sunburst',
  models: ['openai/gpt-image-2.5-sunburst', 'google/gemini-2.5-flash-image'],
  resolution: '1K',
  aspectRatio: '1:1',
  quality: 'auto',
  outputFormat: 'webp',
  count: 1,
  background: 'auto',
  seed: '',
  extraJson: '',
  providerSort: '',
  saveDir: 'generated-images',
}

/** Every Host round-trip a component makes, so the harness can assert on it. */
const calls = []
const jsonResponse = (payload) => ({
  ok: true,
  status: 200,
  json: async () => payload,
  text: async () => JSON.stringify(payload),
})

const fetchShim = async (url, init) => {
  const path = String(url)
  calls.push({ path, method: init?.method ?? 'GET', body: init?.body ?? null })
  if (path === '/open-in-app/apps') return jsonResponse({ apps: ['explorer', 'vscode'] })
  if (path === '/open-in-app/open') return jsonResponse({ ok: true })
  if (path.startsWith('/openrouter-imagen/api/models')) {
    return jsonResponse({ ok: true, models: [{ id: 'z/model', name: 'Z' }, { id: 'a/model', name: 'A' }], count: 2 })
  }
  if (path.startsWith('/openrouter-imagen/api/config')) {
    // A POST is applied to the fixture, so a later mount reads back exactly what
    // an earlier one wrote — the same round trip the real Host performs.
    if (init?.method === 'POST' && typeof init.body === 'string') {
      try {
        Object.assign(dockConfig, JSON.parse(init.body))
      } catch {
        /* a malformed body is itself one of the assertions */
      }
    }
    return jsonResponse({ ok: true, hasKey: true, suggestions: ['a/model'], namespace: 'openrouter-imagen', config: { ...dockConfig } })
  }
  if (path.startsWith('/openrouter-imagen/api/reference')) return jsonResponse({ ok: true, count: 0, references: [] })
  return jsonResponse({ ok: false, error: `unexpected ${path}` })
}

const storage = new Map()
const clipboard = []

const sandbox = {
  window: {
    __ModuleLoader__: {
      load: (definition) => {
        captured = definition
      },
    },
  },
  document: documentShim,
  fetch: fetchShim,
  localStorage: {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  },
  navigator: { clipboard: { writeText: async (text) => clipboard.push(text) } },
  // The strip polls the Host while it is open; the harness only needs the timer
  // to exist, not to fire.
  setInterval: () => 0,
  clearInterval: () => {},
  setTimeout,
  clearTimeout,
  console,
}
vm.createContext(sandbox)

const code = readFileSync(join(ROOT, 'lib', 'client.js'), 'utf8')
vm.runInContext(code, sandbox, { filename: 'lib/client.js' })

if (captured === null) {
  console.log('FAIL: the module never called window.__ModuleLoader__.load')
  process.exit(1)
}
console.log('--- loader registration ---')
console.log(JSON.stringify({ id: captured.id, factory: typeof captured.factory }))

const requireShim = (id) => {
  if (id === 'react') return React
  throw new Error(`unexpected require("${id}") — the client half must only need react`)
}
const exportsObject = captured.factory(requireShim)

console.log('--- plugin shape ---')
console.log(JSON.stringify({ apply: typeof exportsObject.apply, inject: exportsObject.inject }))

const injected = []
const registered = []
// The right-Sidebar face is the seam the plugin repairs: every caller that
// opens a file — the chat's own path links and the 交付文件 card's 打开 button
// included — arrives here, already rewritten into a workspace-relative address.
const SESSION_CWD = ROOT
const sidebarCalls = []
const sidebarService = {
  openResource(address, options) {
    sidebarCalls.push({ method: 'openResource', address, options })
  },
  openResourceIn(sessionId, address, options) {
    sidebarCalls.push({ method: 'openResourceIn', sessionId, address, options })
  },
}
const sessionsService = { list: { getSnapshot: () => ({ byId: { 'sess-1': { cwd: SESSION_CWD } } }) } }
const injectedServices = []
const ctx = {
  effect: (fn) => {
    const dispose = fn()
    return typeof dispose === 'function' ? dispose : () => {}
  },
  get: (name) => (name === 'sidebarRight' ? sidebarService : name === 'sessions' ? sessionsService : undefined),
  inject: (deps, callback) => {
    injectedServices.push(deps.join(','))
    callback(ctx)
    return () => {}
  },
  slots: {
    inject: (key, factory) => {
      injected.push(key)
      const iterator = factory()
      iterator.next()
      return () => {}
    },
    register: (options, component) => {
      registered.push({ options, component })
      return () => {}
    },
  },
}

exportsObject.apply(ctx)

let failures = 0
const check = (label, ok, detail) => {
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : ` — ${detail}`}`)
}

console.log('--- slot registration ---')
const describe = (r) => `${r.options.name}#${r.options.id ?? r.options.key} order=${r.options.order}`
console.log('injected into:', injected.join(', '))
console.log('registered   :', registered.map(describe).join(', ') || '(none)')

const walk = (node, kinds) => {
  if (node === null || node === undefined || typeof node === 'string') return
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, kinds))
    return
  }
  if (typeof node === 'object' && node.type !== undefined) {
    kinds.push(typeof node.type === 'string' ? node.type : node.type.name || 'Component')
    ;(node.children ?? []).forEach((child) => walk(child, kinds))
  }
}

/** Every string rendered anywhere in a tree, flattened. */
const collectText = (node, out) => {
  if (node === null || node === undefined) return out
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node))
    return out
  }
  if (Array.isArray(node)) {
    node.forEach((child) => collectText(child, out))
    return out
  }
  if (typeof node === 'object' && node.type !== undefined) {
    ;(node.children ?? []).forEach((child) => collectText(child, out))
  }
  return out
}

/** Depth-first search for the first element matching a predicate. */
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

/** Every element matching a predicate, in document order. */
const findNodes = (node, predicate, out = []) => {
  if (node === null || node === undefined || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    for (const child of node) findNodes(child, predicate, out)
    return out
  }
  if (node.type !== undefined) {
    if (predicate(node)) out.push(node)
    for (const child of node.children ?? []) findNodes(child, predicate, out)
  }
  return out
}

const find = (name, id) => registered.find((r) => r.options.name === name && (id === undefined || r.options.id === id))

/** One fresh mount of a component, with its effects run once. */
const mount = (component, props) => {
  cells = []
  cursor = 0
  effects = []
  dirty = false
  const tree = component(props ?? {})
  const recorded = effects.slice()
  effects = []
  recorded.forEach((fn) => {
    if (typeof fn === 'function') fn()
  })
  return tree
}
const render = (component, props) => {
  const kinds = []
  walk(mount(component, props), kinds)
  return kinds
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
/** Re-render the CURRENT component with its state cells preserved (no effect re-run). */
const retree = (component) => {
  cursor = 0
  effects = []
  return component()
}
const firstButton = (node) => findNode(node, (element) => element.type === 'button')
const buttonByText = (node, text) =>
  findNode(node, (element) => element.type === 'button' && collectText(element.children ?? [], []).join('') === text)
const inputByClass = (node, className) =>
  findNode(node, (element) => element.type === 'input' && String(element.props.className ?? '').includes(className))

for (const entry of registered) {
  const label = describe(entry)
  if (typeof entry.component !== 'function') check(`${label} has a component`, false)
}

const settings = find('settings.section', 'openrouter-imagen')
const dock = find('conversation.input.dock', 'openrouter-imagen')
const toggle = find('conversation.input.right', 'openrouter-imagen-toggle')
const card = registered.find((r) => r.options.name === 'tool.call.toolview' && r.options.key === 'openrouter_generate_imagen')

check('registers the settings page', settings !== undefined)
check('registers the composer strip slot', dock !== undefined)
check('registers the composer toggle slot', toggle !== undefined)
check('registers the tool card for its own tool name', card !== undefined, card === undefined ? 'no tool.call.toolview cell' : 'key=openrouter_generate_imagen')

try {
  mount(settings.component)
  await tick()
  const settingsTree = retree(settings.component)
  const settingsKinds = []
  walk(settingsTree, settingsKinds)
  const settingsText = collectText(settingsTree, [])
  check('settings page renders', settingsKinds.length > 0, `${settingsKinds.length} nodes`)

  // Settings is the long-lived configuration only: the per-generation knobs
  // live in the composer panel, and the test-generation block is gone entirely.
  const selects = settingsKinds.filter((kind) => kind === 'select').length
  check('Settings keeps the Provider sort and catalog selects', selects === 2, `${selects} select(s)`)
  check('Settings no longer embeds a test generation', !settingsText.includes('试生成') && !settingsKinds.includes('textarea'), [...new Set(settingsKinds)].join(', '))
  check('Settings no longer offers 附加请求参数', !settingsKinds.includes('textarea'), 'no textarea left on the page')
  check('Settings gained 保存目录', settingsText.includes('保存目录'), 'output location is configurable')
  check('Settings still offers the model list', settingsKinds.includes('datalist'))
  check('Settings names the composer panel', settingsText.some((t) => t.includes('「图像」面板')), 'subtitle points at the panel')

  // Five sections (密钥 / 模型 / 请求 / 输出 / 技能), and the page closes with a
  // save-status bar instead of a save button: every change posts itself.
  const sections = settingsKinds.filter((kind) => kind === 'section').length
  check('Settings is five titled sections', sections === 5, `${sections} sections`)
  const savebar = settingsTree.children[settingsTree.children.length - 1]
  check('a save-status bar closes the page', savebar?.props?.className === 'dsh-oi-savebar', savebar?.props?.className)
  check('the save button is gone entirely', findNode(settingsTree, (element) => element.type === 'button' && String(element.props.className ?? '').includes('dsh-oi-btn-primary')) === null && buttonByText(settingsTree, '保存配置') === null)
  check('the page promises auto-save', settingsText.some((t) => t.includes('自动保存')), '')
} catch (error) {
  check('settings page renders', false, error?.stack ?? String(error))
}

/* ---- auto-save behaviour: every change writes itself, no button involved ---- */

try {
  const selectsOf = (tree) => findNodes(tree, (element) => element.type === 'select')
  const modelRowsOf = (tree) =>
    findNodes(tree, (element) => element.type === 'div' && String(element.props.className ?? '').includes('dsh-oi-model-row'))
  const rowText = (row) => collectText(row.children ?? [], []).join(' ')
  const configPosts = () => calls.filter((entry) => entry.path.endsWith('/config') && entry.method === 'POST')

  mount(settings.component)
  await tick()
  let tree = retree(settings.component)

  // The Provider sort select commits itself the moment it changes.
  const sortSelect = selectsOf(tree).find((element) => findNode(element, (option) => option.props?.value === 'price') !== null)
  const beforeSort = calls.length
  sortSelect?.props?.onChange?.({ target: { value: 'price' } })
  await tick()
  const sortPost = calls.slice(beforeSort).find((entry) => String(entry.body).includes('"providerSort":"price"'))
  check('changing a select auto-saves at once', sortPost !== undefined, sortPost === undefined ? 'no POST' : String(sortPost.body))

  // The model palette: one row per configured model, 默认 on the row the next
  // generation uses, and clicking another row hands 默认 over without a save step.
  let rows = modelRowsOf(tree)
  check('each configured model is one palette row', rows.length === 2, `${rows.length} row(s)`)
  const chipOf = (row) => findNode(row, (element) => element.type === 'span' && element.props?.className === 'dsh-oi-chip')
  check('the default row carries the 默认 chip', chipOf(rows[0]) !== null && chipOf(rows[1]) === null, rowText(rows[1]).trim())
  const beforeDefault = calls.length
  rows[1]?.props?.onClick?.()
  await tick()
  const defaultPost = calls.slice(beforeDefault).find((entry) => String(entry.body).includes('"model":"google/gemini-2.5-flash-image"'))
  check('clicking a row sets it as the default model', defaultPost !== undefined, defaultPost === undefined ? 'no POST' : String(defaultPost.body))

  // 移除 writes the surviving palette together with the default that follows it.
  tree = retree(settings.component)
  rows = modelRowsOf(tree)
  const beforeRemove = calls.length
  findNode(rows[0], (element) => element.type === 'button' && collectText(element.children ?? [], []).join('') === '移除')?.props?.onClick?.({ stopPropagation() {} })
  await tick()
  const removePost = calls.slice(beforeDefault).filter((entry) => String(entry.body).includes('"models"')).pop()
  check(
    'removing a model persists the surviving palette and default',
    removePost !== undefined && String(removePost.body).includes('google/gemini-2.5-flash-image') && !String(removePost.body).includes('openai/gpt-image-2.5-sunburst'),
    removePost === undefined ? 'no POST' : String(removePost.body),
  )

  // Adding one model by hand (the Enter path, which reads the event, not stale state).
  const beforeAdd = calls.length
  const addInput = findNode(retree(settings.component), (element) => element.type === 'input' && element.props?.list === 'dsh-oi-model-options')
  addInput?.props?.onKeyDown?.({ key: 'Enter', target: { value: 'custom/model' }, preventDefault() {} })
  await tick()
  const addPost = calls.slice(beforeAdd).find((entry) => String(entry.body).includes('custom/model'))
  check('adding a model by id writes the whole palette', addPost !== undefined, addPost === undefined ? 'no POST' : String(addPost.body))

  // The catalog dropdown is filled BEFORE any fetch (the host's suggestions) and
  // picking one adds it — this is the fix for "拉取了列表但下拉是空的".
  tree = retree(settings.component)
  const pickerSelect = selectsOf(tree).find((element) => findNode(element, (option) => option.props?.value === 'a/model') !== null)
  check('the catalog select is prefilled with suggestions', pickerSelect !== undefined, pickerSelect === undefined ? 'no select with a/model' : '')
  const beforePick = calls.length
  pickerSelect?.props?.onChange?.({ target: { value: 'a/model' } })
  await tick()
  check('picking from the dropdown adds that model', calls.slice(beforePick).some((entry) => String(entry.body).includes('"a/model"')), '')

  // 拉取模型列表 fills the SAME dropdown with the fetched catalog.
  const fetchButton = buttonByText(retree(settings.component), '拉取模型列表')
  const beforeFetch = calls.length
  fetchButton?.props?.onClick?.()
  await tick()
  const fetchedTree = retree(settings.component)
  const fetchedSelect = selectsOf(fetchedTree).find((element) => findNode(element, (option) => option.props?.value === 'z/model') !== null)
  check('拉取模型列表 fills the dropdown with the fetched catalog', fetchedSelect !== undefined && calls.slice(beforeFetch).some((entry) => entry.path.includes('/models')), '')
  fetchedSelect?.props?.onChange?.({ target: { value: 'z/model' } })
  await tick()
  check('picking a fetched model adds it to the palette', calls.slice(beforeFetch).some((entry) => String(entry.body).includes('"z/model"')), '')

  // The API key commits on blur (blank never writes, per the write-only rule).
  const keyInput = findNode(retree(settings.component), (element) => element.type === 'input' && element.props?.type === 'password')
  keyInput?.props?.onChange?.({ target: { value: 'sk-or-v1-preflight' } })
  const beforeKey = calls.length
  findNode(retree(settings.component), (element) => element.type === 'input' && element.props?.type === 'password')?.props?.onBlur?.({ target: { value: 'sk-or-v1-preflight' } })
  await tick()
  const keyPost = calls.slice(beforeKey).find((entry) => String(entry.body).includes('"apiKey":"sk-or-v1-preflight"'))
  check('a typed API key auto-saves on blur', keyPost !== undefined, keyPost === undefined ? 'no POST' : String(keyPost.body))

  // Text fields save themselves after a short debounce — no blur needed.
  const beforeDebounce = calls.length
  const saveDirInput = findNode(retree(settings.component), (element) => element.type === 'input' && element.props?.placeholder === 'generated-images')
  saveDirInput?.props?.onChange?.({ target: { value: 'out-x' } })
  await new Promise((resolve) => setTimeout(resolve, 700))
  const debouncePost = calls.slice(beforeDebounce).find((entry) => String(entry.body).includes('"saveDir":"out-x"'))
  check('a text field auto-saves after the debounce', debouncePost !== undefined, debouncePost === undefined ? 'no POST' : String(debouncePost.body))

  // …and blurring before the timer fires flushes once, not twice.
  const beforeFlush = calls.length
  const dirInput = findNode(retree(settings.component), (element) => element.type === 'input' && element.props?.placeholder === 'generated-images')
  dirInput?.props?.onChange?.({ target: { value: 'out-y' } })
  dirInput?.props?.onBlur?.({ target: { value: 'out-y' } })
  await new Promise((resolve) => setTimeout(resolve, 700))
  const dirPosts = calls.slice(beforeFlush).filter((entry) => String(entry.body).includes('saveDir'))
  check('blur flushes the pending write instead of doubling it', dirPosts.length === 1 && String(dirPosts[0].body).includes('"saveDir":"out-y"'), JSON.stringify(dirPosts.map((entry) => entry.body)))

  // The one boolean rides the product's own toggle.
  const skillsSwitch = findNode(retree(settings.component), (element) => element.type === 'input' && element.props?.type === 'checkbox')
  check('the skills toggle is a native switch', skillsSwitch !== null, '')
  const beforeSwitch = calls.length
  skillsSwitch?.props?.onChange?.({ target: { checked: false } })
  await tick()
  check('toggling the skill writes itself', calls.slice(beforeSwitch).some((entry) => String(entry.body).includes('"skills":false')), '')
} catch (error) {
  check('settings auto-save flow', false, error?.stack ?? String(error))
}

try {
  const dir = join(ROOT, 'generated-images')
  const settled = {
    kind: 'tool-call',
    isError: false,
    call: { name: 'openrouter_generate_imagen', argsRaw: JSON.stringify({ prompt: '一只水彩狐狸' }) },
    content: [
      {
        type: 'text',
        text: `已生成 1 张图片（模型 openai/gpt-image-2.5-sunburst，耗时 24 秒，费用 $0.0069）。\n保存目录：${dir}\n种子：987654（本次随机）\n文件：${dir}\\out.webp`,
      },
      {
        type: 'image',
        attachment: { attachmentId: 'att-1', mediaType: 'image/webp', bytes: 2048, width: 1024, height: 1024, name: 'out.webp' },
      },
    ],
  }
  const cardKinds = []
  const opened = []
  const cardTree = mount(card.component, {
    block: settled,
    loadImage: async () => 'blob:test',
    openFile: (path) => opened.push(path),
  })
  walk(cardTree, cardKinds)
  const cardText = collectText(cardTree, []).join(' | ')
  check('tool card renders its image child', cardKinds.includes('ToolImage'), [...new Set(cardKinds)].join(', '))
  check('tool card keeps the result summary', cardText.includes('已生成 1 张图片'), cardText.slice(0, 60))
  check('tool card drops the raw paths from the summary', !cardText.includes('已生成 1 张图片（模型 openai/gpt-image-2.5-sunburst，耗时 24 秒，费用 $0.0069）。 | 保存目录'), 'paths moved to the footer')
  check('tool card shows the prompt', cardText.includes('一只水彩狐狸'))

  // The answer to "where did it go": the folder itself, a link that opens it,
  // and a copy fallback.
  check('tool card names the save folder', cardText.includes(dir), cardText.slice(0, 80))
  const openButton = buttonByText(cardTree, '打开文件夹')
  const copyButton = buttonByText(cardTree, '复制路径')
  check('tool card offers 打开文件夹', openButton !== null)
  check('tool card offers 复制路径', copyButton !== null)
  check('tool card shows the seed the generation used', cardText.includes('种子 987654（随机）'), cardText.slice(-90))

  const before = calls.length
  openButton?.props?.onClick?.()
  await tick()
  await tick()
  const launch = calls.slice(before).find((entry) => entry.path === '/open-in-app/open')
  check(
    '打开文件夹 asks the host to launch a directory app',
    launch !== undefined && launch.method === 'POST' && String(launch.body).includes('explorer') && String(launch.body).includes(basename(ROOT)),
    launch === undefined ? 'no /open-in-app/open call' : String(launch.body),
  )

  copyButton?.props?.onClick?.()
  await tick()
  check('复制路径 puts the folder on the clipboard', clipboard[clipboard.length - 1] === dir, clipboard[clipboard.length - 1])

  // Clicking a picture hands its absolute path to the view's own file opener.
  const openImage = findNode(cardTree, (element) => element.type === 'button' && String(element.props.className ?? '') === 'dsh-oi-shot-open')
  openImage?.props?.onClick?.()
  check('clicking an image opens the file in the sidebar', opened.length === 1 && opened[0].endsWith('out.webp'), opened.join(', '))
  check(
    'the opener never receives a workspace-relative path',
    /^[A-Za-z]:[\\/]/u.test(opened[0] ?? ''),
    opened[0] ?? '',
  )
  check(
    'an in-workspace path keeps its absolute spelling past the address rewrite',
    (opened[0] ?? '').startsWith(rootDrive),
    opened[0] ?? '',
  )

  // A Host (or an older build) that prints a relative path must not reach the
  // sidebar either: the card resolves it against the view's own cwd.
  const relative = {
    ...settled,
    content: [
      { type: 'text', text: `已生成 1 张图片（模型 m，耗时 1 秒）。\n保存目录：generated-images\n文件：generated-images\\rel.webp` },
      { type: 'image', attachment: { attachmentId: 'att-2', mediaType: 'image/webp', bytes: 2048, width: 512, height: 512, name: 'rel.webp' } },
    ],
  }
  const openedRelative = []
  const relativeTree = mount(card.component, {
    block: relative,
    cwd: ROOT,
    loadImage: async () => 'blob:test',
    openFile: (path) => openedRelative.push(path),
  })
  findNode(relativeTree, (element) => element.type === 'button' && String(element.props.className ?? '') === 'dsh-oi-shot-open')?.props?.onClick?.()
  check(
    'a relative path from the Host is resolved against the view cwd before opening',
    new RegExp(`^${rootPattern}[\\\\/]generated-images[\\\\/]rel\\.webp$`, 'iu').test(openedRelative[0] ?? ''),
    openedRelative[0] ?? '',
  )

  const runningKinds = []
  walk(mount(card.component, { block: { argsRaw: JSON.stringify({ prompt: '运行中' }), name: 'openrouter_generate_imagen' }, loadImage: async () => 'blob:test' }), runningKinds)
  check('tool card renders the running state', runningKinds.includes('div'), `${runningKinds.length} nodes while running`)

  const failedKinds = []
  const failedTree = mount(card.component, {
    block: { kind: 'tool-call', isError: true, call: { name: 'openrouter_generate_imagen', argsRaw: '{}' }, content: [{ type: 'text', text: '图像生成失败：401' }] },
    loadImage: async () => 'blob:test',
  })
  const failedText = collectText(failedTree, failedKinds).join(' ')
  check('tool card surfaces a failure', failedText.includes('图像生成失败：401'), failedText.slice(0, 40))
  check('a failed call offers no folder button', buttonByText(failedTree, '打开文件夹') === null)
} catch (error) {
  check('tool card renders', false, error?.stack ?? String(error))
}

try {
  const attachment = { attachmentId: 'att-1', mediaType: 'image/webp', bytes: 2048, width: 1024, height: 1024, name: 'out.webp' }
  let tree = mount(exportsObject.ToolImage, { attachment, loadImage: async () => 'blob:test' })
  check('image shows a placeholder while it loads', tree?.type === 'div', String(tree?.type))
  await tick()
  tree = (() => {
    cursor = 0
    effects = []
    return exportsObject.ToolImage({ attachment, loadImage: async () => 'blob:test' })
  })()
  check('image renders once the loader resolves', tree?.type === 'img' && tree.props.src === 'blob:test', JSON.stringify(tree?.props?.src))
} catch (error) {
  check('ToolImage loads', false, error?.stack ?? String(error))
}

try {
  check('composer strip starts collapsed', render(dock.component).length === 0, 'renders nothing until asked')

  // The palette tests above rewrote the fixture through the auto-save POSTs;
  // restore the two-model palette the strip assertions assume.
  dockConfig.model = 'openai/gpt-image-2.5-sunburst'
  dockConfig.models = ['openai/gpt-image-2.5-sunburst', 'google/gemini-2.5-flash-image']

  const toggleKinds = render(toggle.component)
  check('toggle renders a button', toggleKinds.includes('button'), [...new Set(toggleKinds)].join(', '))

  const button = firstButton(mount(toggle.component))
  check('toggle exposes a click handler', typeof button?.props?.onClick === 'function')
  button?.props?.onClick?.()

  mount(dock.component)
  await tick()
  const dockTree = retree(dock.component)
  const expanded = []
  walk(dockTree, expanded)
  const selects = expanded.filter((kind) => kind === 'select').length
  check('clicking the toggle reveals the generation knobs', selects >= 7, `${expanded.length} nodes, ${selects} selects`)
  // 模型 rides in front of the six per-call knobs once the user added a second
  // model in Settings — the palette is what makes it switchable in place.
  check('the strip gained the model switcher', selects === 7, `${selects} selects`)
  const modelSelect = findNode(
    dockTree,
    (element) =>
      element.type === 'select' &&
      findNode(element, (option) => option.props?.value === 'google/gemini-2.5-flash-image') !== null,
  )
  check('the model switcher lists the configured palette', modelSelect !== undefined && modelSelect.props.value === 'openai/gpt-image-2.5-sunburst', '')
  const beforeModel = calls.length
  modelSelect?.props?.onChange?.({ target: { value: 'google/gemini-2.5-flash-image' } })
  await tick()
  check(
    'switching the model in the strip writes the settings namespace',
    calls.slice(beforeModel).some((entry) => entry.path.endsWith('/config') && String(entry.body).includes('"model":"google/gemini-2.5-flash-image"')),
    '',
  )

  // 种子 lives in this strip, on the same row as the selects. The JSON escape
  // hatch that used to sit beside it is gone: the strip is one row of knobs.
  const seedInput = inputByClass(dockTree, 'dsh-oi-dock-seed')
  const jsonInput = inputByClass(dockTree, 'dsh-oi-dock-json')
  check('the strip offers 种子', seedInput !== null && String(seedInput.props.placeholder) === '随机')
  check('the strip no longer offers 附加参数', jsonInput === null)
  const dockRows = findNodes(dockTree, (element) => element.type === 'div' && String(element.props.className ?? '') === 'dsh-oi-dock-row')
  check('the strip is a single row', dockRows.length === 1, `${dockRows.length} row(s)`)
  const rowText = collectText(dockRows[0]?.children ?? [], []).join(' ').replace(/\s+/gu, ' ')
  check('种子 sits on that row after 背景', /背景[^]*种子/u.test(rowText), rowText.trim().slice(0, 96))

  // A non-numeric seed is refused locally instead of being POSTed and rejected
  // later, at generation time.
  const beforeBad = calls.length
  seedInput?.props?.onBlur?.({ target: { value: 'abc' } })
  await tick()
  check('a non-numeric 种子 never reaches the Host', calls.length === beforeBad, `${calls.length - beforeBad} call(s)`)

  const beforeGood = calls.length
  seedInput?.props?.onBlur?.({ target: { value: '42' } })
  await tick()
  const seeded = calls.slice(beforeGood).find((entry) => entry.path.endsWith('/config') && String(entry.body).includes('seed'))
  check('a valid 种子 is written to the settings namespace', seeded !== undefined, seeded === undefined ? 'no POST' : String(seeded.body))

  // 随机 puts the box back to "draw one for me", and says so on the Host.
  const randomButton = buttonByText(dockTree, '随机')
  check('the strip offers 随机', randomButton !== null)
  const beforeRandom = calls.length
  randomButton?.props?.onClick?.()
  await tick()
  const cleared = calls.slice(beforeRandom).find((entry) => entry.path.endsWith('/config') && String(entry.body).includes('"seed":""'))
  check('随机 clears the seed on the Host', cleared !== undefined, cleared === undefined ? 'no POST' : String(cleared.body))

  // A finished generation reports the seed it drew; the strip takes it over so
  // the next call reproduces the picture. The POST is what matters — the Host
  // reads the seed from settings, not from whatever the input box displays.
  const beforeAuto = calls.length
  mount(card.component, {
    block: {
      kind: 'tool-call',
      isError: false,
      call: { name: 'openrouter_generate_imagen', argsRaw: '{}' },
      content: [{ type: 'text', text: '已生成 1 张图片（模型 m）。\n保存目录：X:\\p\\generated-images\n种子：987654（本次随机）\n文件：X:\\p\\generated-images\\a.webp' }],
    },
    loadImage: async () => 'blob:test',
  })
  await tick()
  const handedOver = calls.slice(beforeAuto).find((entry) => entry.path.endsWith('/config') && String(entry.body).includes('987654'))
  check('a finished generation hands its seed to the strip', handedOver !== undefined, handedOver === undefined ? 'no POST' : String(handedOver.body))
  check('the strip persisted that seed for the next call', dockConfig.seed === '987654', String(dockConfig.seed))

  button?.props?.onClick?.()
  check('clicking again collapses the strip', render(dock.component).length === 0)

  // A pasted image must never become a draft message attachment: the shipped
  // composer validates those against the chat model's input modalities, and a
  // text-only model refuses to send at all.
  const onPaste = listeners.get('paste')
  check('a capture-phase paste listener is installed', typeof onPaste === 'function')
  let prevented = false
  onPaste({
    clipboardData: { files: [{ type: 'image/png', name: 'pasted.png', arrayBuffer: async () => new ArrayBuffer(8) }] },
    preventDefault: () => {
      prevented = true
    },
  })
  check('pasting an image suppresses the draft attachment', prevented === true)
  check('pasting an image reveals the strip', render(dock.component).length > 0, 'strip auto-opens')

  let ignored = 0
  onPaste({ clipboardData: { files: [{ type: 'text/plain', name: 'note.txt' }] }, preventDefault: () => { ignored += 1 } })
  check('pasting a non-image is left alone', ignored === 0)
} catch (error) {
  check('composer toggle flow', false, error?.stack ?? String(error))
}

// The chat's path links and the 交付文件 card's 打开 button both reach the
// sidebar as `dsh-resource://file/session/<id>/generated-images/out.png` — the
// absolute path rewritten away by `fileAddressFor`. The hover tooltip keeps the
// absolute path while the opened tab loses it, and this build cannot read the
// relative form back, so the plugin puts the absolute spelling back on the one
// seam every caller shares.
console.log('\n--- sidebar file addresses ---')
try {
  const { absolutizeFileAddress, installSidebarAbsolutePaths } = exportsObject
  const PREFIX = 'dsh-resource://file/session/'
  const cwdOf = (sessionId) => (sessionId === 'sess-1' ? SESSION_CWD : undefined)
  const relativeAddress = `${PREFIX}sess-1/generated-images/out.webp`
  const rootSlash = ROOT.replace(/\\/gu, '/')
  const absoluteAddress = `${PREFIX}sess-1/${rootSlash}/generated-images/out.webp`
  const rewritten = absolutizeFileAddress(relativeAddress, cwdOf)

  check('the plugin waits for the right-Sidebar face', injectedServices.includes('sidebarRight'), injectedServices.join(' / ') || '(none)')
  check('a workspace-relative session address gets its absolute path back', rewritten === absoluteAddress, rewritten)
  check('an address that already carries an absolute path is left alone', absolutizeFileAddress(absoluteAddress, cwdOf) === absoluteAddress)
  check('an unknown Session keeps the address it had', absolutizeFileAddress(relativeAddress, () => undefined) === relativeAddress)
  check('a cwd-less lookup keeps the address it had', absolutizeFileAddress(relativeAddress, undefined) === relativeAddress)
  check(
    'an absolute-scope address is not touched',
    absolutizeFileAddress('dsh-resource://file/absolute/X:/a/b.png', cwdOf) === 'dsh-resource://file/absolute/X:/a/b.png',
  )
  check('a plain URL is not touched', absolutizeFileAddress('https://example.com/a.png', cwdOf) === 'https://example.com/a.png')
  check('a non-string address is not touched', absolutizeFileAddress(undefined, cwdOf) === undefined)

  const chinese = `${PREFIX}sess-1/generated-images/${encodeURIComponent('我的 图.webp')}`
  const chineseRewritten = absolutizeFileAddress(chinese, cwdOf)
  check(
    'a name with a space and Chinese characters survives the rewrite',
    decodeURIComponent(chineseRewritten.slice(`${PREFIX}sess-1/`.length)) ===
      `${rootSlash}/generated-images/我的 图.webp`,
    chineseRewritten,
  )
  check(
    'a per-cent sign in a file name round-trips rather than corrupting the address',
    decodeURIComponent(absolutizeFileAddress(`${PREFIX}sess-1/a%25b/out.webp`, cwdOf).slice(`${PREFIX}sess-1/`.length)) ===
      `${rootSlash}/a%b/out.webp`,
  )

  // The live face installed at apply time: this is what the card's 打开 button and
  // the chat's path links actually hit.
  sidebarCalls.length = 0
  sidebarService.openResource(relativeAddress, { replaceTab: 'tab-1' })
  check(
    'the live sidebar face now receives the absolute address',
    sidebarCalls[0]?.address === absoluteAddress,
    sidebarCalls[0]?.address,
  )
  check('only the address changes: the open options travel through', sidebarCalls[0]?.options?.replaceTab === 'tab-1')

  sidebarCalls.length = 0
  sidebarService.openResourceIn('sess-1', relativeAddress)
  check('the in-Session opener is repaired too', sidebarCalls[0]?.address === absoluteAddress, sidebarCalls[0]?.address)
  sidebarCalls.length = 0
  sidebarService.openResourceIn('other', relativeAddress)
  check('the in-Session opener leaves an unknown Session alone', sidebarCalls[0]?.address === relativeAddress, sidebarCalls[0]?.address)

  // Reversibility: the patch must come off again, and a face it cannot patch
  // must be left exactly as it was.
  const fake = {
    seen: [],
    openResource(address) {
      this.seen.push(address)
    },
  }
  const dispose = installSidebarAbsolutePaths({ get: () => fake }, cwdOf)
  fake.openResource(relativeAddress)
  check('installing replaces the opening method', fake.seen[0] === absoluteAddress, fake.seen[0])
  dispose()
  fake.openResource(relativeAddress)
  check('disposing restores the original method', fake.seen[1] === relativeAddress, fake.seen[1])

  let froze = false
  try {
    const frozen = Object.freeze({ openResource: () => {} })
    installSidebarAbsolutePaths({ get: () => frozen }, cwdOf)()
  } catch {
    froze = true
  }
  check('a face that refuses the write is left alone instead of throwing', froze === false)
  check('no face at all is a no-op disposer', typeof installSidebarAbsolutePaths({ get: () => undefined }, cwdOf) === 'function')
} catch (error) {
  check('sidebar file addresses', false, error?.stack ?? String(error))
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exitCode = failures === 0 ? 0 : 1
