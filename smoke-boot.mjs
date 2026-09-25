/**
 * Boot smoke test for the dsh 0.1.7 contract.
 *
 * Loads the real host half (and the skill half it mounts), runs `apply` against
 * a stub Context that mirrors the 0.1.7 service shapes, and asserts the calls
 * the plugin makes are the ones the runtime actually exposes:
 *
 *   - `ctx.settings.register` must never be called (it no longer exists);
 *   - the exported Config must be a volatile form, which is what makes the
 *     settings service treat the row as editable;
 *   - `ctx.tools.register` must receive a well-formed tool;
 *   - the reported namespace must equal the profile row id, which is what
 *     `ctx.settings.update(ns, patch)` resolves against;
 *   - the bundled skill must be listed and resolved by the REAL
 *     `SkillRegistry` (a hand-rolled stand-in can drift from the validator the
 *     runtime actually runs), with its body arriving frontmatter-free and
 *     organized style-family-first.
 */
import { readFileSync } from 'node:fs'
import { Readable } from 'node:stream'
import { Context } from '@deepseek-ai/cordis'
import SkillRegistry, { renderSkillContent } from '@deepseek-ai/dsh-skill'

const NS = 'openrouter-imagen'
const SKILL_NAME = 'openrouter-imagen'
const SKILL_PATH = new URL('./skills/openrouter-imagen/SKILL.md', import.meta.url)

/** Representative styles the catalog description must name as TRIGGERS (not a supported-set claim). */
const TRIGGER_STYLES = ['摄影', '3D 渲染', '插画', '卡通', '线条图', '扁平', '像素']

/**
 * The exact wire contract, mirroring `buildBody()` in lib/index.js: the fields the
 * plugin puts on the POST /images body. The model must know this list or it will
 * invent those fields in the prompt instead of leaving them to the API.
 */
const API_FIELDS = ['model', 'n', 'resolution', 'aspect_ratio', 'quality', 'output_format', 'background', 'seed', 'provider', 'input_references']

const failures = []
const check = (label, ok, detail) => {
  if (!ok) failures.push(label)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : ` — ${detail}`}`)
}
/** One volatile reference, shaped exactly like cosmokit's createVolatile. */
const ref = (value) => ({ get: () => value })

const config = (overrides = {}) => ({
  apiKey: ref(undefined),
  model: ref('google/gemini-2.5-flash-image'),
  resolution: ref('1K'),
  aspectRatio: ref('auto'),
  quality: ref('auto'),
  outputFormat: ref('png'),
  count: ref(1),
  background: ref('auto'),
  seed: ref(''),
  providerSort: ref(''),
  extraJson: ref(''),
  saveDir: ref('generated-images'),
  skills: ref(true),
  ...overrides,
})

/**
 * One boot. `withSkills: false` mirrors a deployment whose composition has no
 * skill registry — the paid tool must still come up.
 */
const boot = ({ withSkills = true, overrides = {} } = {}) => {
  const state = { tools: [], routes: [], updates: [], mounts: [], warnings: [], requested: [] }
  // The REAL registry. Its `registerProvider` validates the candidate, so a
  // successful boot is itself the proof that the runtime would accept it.
  const registryCtx = new Context()
  new SkillRegistry(registryCtx)
  const ctx = {
    effect(fn) {
      const dispose = fn()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    get(name) {
      state.requested.push(name)
      if (name === 'settings') return { update: async (ns, patch) => state.updates.push({ ns, patch }) }
      if (name === 'attachments') return { saveImages: async () => [], saveFile: async () => undefined, fileHostPath: () => '' }
      if (name === 'webServer') return { register: (route) => state.routes.push(route) }
      if (name === 'fs') return { readFile: async () => '' }
      if (name === 'connection') return { requestRejection: () => undefined }
      if (name === 'skills') return withSkills ? registryCtx.skills : undefined
      return undefined
    },
    inject() {},
    plugin(mod) {
      state.mounts.push(mod)
    },
    logger: { warn: (message) => state.warnings.push(String(message)) },
    settings: {
      // The removed API: reaching it must fail loudly rather than silently.
      register() {
        throw new Error('ctx.settings.register must not be called on dsh >= 0.1.7')
      },
    },
    tools: {
      register(tool) {
        state.tools.push(tool)
        return () => {}
      },
    },
  }
  return { ctx, state, registryCtx }
}

const mod = await import('./lib/index.js')

check('exports a Config schema', mod.Config !== undefined)
check('does not require the removed `settings` service', !(mod.inject ?? []).includes('settings'), JSON.stringify(mod.inject))
check('does not declare `skills` on the main plugin', !(mod.inject ?? []).includes('skills'), JSON.stringify(mod.inject))

// Mirrors dsh-settings volatileForm: a row is editable only if some field is volatile.
const dictKeys = Object.keys(mod.Config.dict ?? {})
const volatileKeys = Object.entries(mod.Config.dict ?? {}).filter(([, s]) => s.meta?.volatile === true).map(([k]) => k)
check('every declared field is volatile (row is editable)', volatileKeys.length === dictKeys.length, `${volatileKeys.length}/${dictKeys.length}`)

/* ---- main half ---- */

const main = boot()
mod.apply(main.ctx, config())

check('registers exactly one tool', main.state.tools.length === 1, String(main.state.tools.length))
const tool = main.state.tools[0]
check('tool carries the expected name', tool?.name === 'openrouter_generate_imagen', tool?.name)
check('tool is a closed object schema', tool?.parameters?.type === 'object', tool?.parameters?.type)
check('tool declares output render', typeof tool?.output?.render === 'function')
check('mounts the browser API route', main.state.routes.length === 1, String(main.state.routes.length))
check('route path is the client API root', main.state.routes[0]?.path === '/openrouter-imagen/api', main.state.routes[0]?.path)
check('route is a prefix route', main.state.routes[0]?.kind === 'prefix', main.state.routes[0]?.kind)

// The panel lives in the composer, which the conversation model cannot read, so
// the plugin must NOT pretend to know its values. What it can do is state the
// rule: panel fields travel as API fields, never as prompt text.
check('tool description keeps panel fields out of the prompt', tool.description.includes('面板参数的值也不要写进 prompt') && tool.description.includes('看不到面板当前的值'), '')
check('tool description states the default-fill rule', tool.description.includes('默认只填 `prompt`') && tool.description.includes('留空就是用面板的值'), '')
check('tool description says leaving them blank is correct', tool.description.includes('留空是正确行为、不是遗漏'), '')
check('tool description forbids deciding count for the user', tool.description.includes('不要自己判断「这次适合出几张」'), '')
check('tool description scopes prompt text to conversation-named parameters', tool.description.includes('这条对话里提到过的'), '')
check('tool description asks for visual language over raw values', tool.description.includes('vertical composition, tall framing'), '')
const missingFromTool = API_FIELDS.filter((field) => !tool.description.includes(`\`${field}\``))
check('tool description names the same API fields', missingFromTool.length === 0, missingFromTool.join(', ') || `all ${API_FIELDS.length} present`)
check('the plugin never claims to read the composer panel', !main.state.requested.includes('systemPrompt') && !tool.description.includes('面板的当前设置'), main.state.requested.join(', '))

/* ---- skill half: mounted by the main half, not merged into it ---- */

check('mounts exactly one child plugin (the skill half)', main.state.mounts.length === 1, String(main.state.mounts.length))
const child = main.state.mounts[0]
check('child half is the skills module', typeof child?.apply === 'function' && child?.name === 'openrouter-imagen-skills', child?.name)
check('child half injects only `skills`', JSON.stringify(child?.inject) === '["skills"]', JSON.stringify(child?.inject))

// The child's own context. `inject: ['skills']` guarantees `ctx.skills` is there
// by the time the runtime applies it, so the registry is handed over directly.
child.apply({ skills: main.registryCtx.skills, logger: main.ctx.logger })

check('no warning was logged during skill registration', main.state.warnings.length === 0, main.state.warnings.join(' | '))

const catalog = await main.registryCtx.skills.list({})
check('the real registry lists exactly one skill', catalog.length === 1, String(catalog.length))
const entry = catalog[0]
check('skill name is kebab-case and namespaced', entry?.name === SKILL_NAME, entry?.name)
check('skill source is bundled', entry?.source === 'bundled', entry?.source)
check('skill is both model- and user-invocable', entry?.invocation?.modelInvocable === true && entry?.invocation?.userInvocable === true)
check('skill carries a non-empty description', typeof entry?.description === 'string' && entry.description.length > 40)
check('description is a single line (catalog-safe)', !/[\r\n]/u.test(entry?.description ?? ''))
// The catalog truncates the TAIL at 500 chars, so the triggers must fit inside it.
const description = entry?.description ?? ''
check('description fits the catalog budget', description.length <= 500, `${description.length}/500 chars`)
check('description names the generate intent in both languages', description.includes('生成') && description.includes('text-to-image'))
check('description names the modify intent in both languages', description.includes('修改') && description.includes('image-to-image'))
check('description front-loads an image trigger', /^[^。]{0,20}(图片|生成)/u.test(description), JSON.stringify(description.slice(0, 24)))
check('description names representative styles as triggers', TRIGGER_STYLES.every((style) => description.includes(style)), TRIGGER_STYLES.filter((style) => !description.includes(style)).join(', ') || `all ${TRIGGER_STYLES.length} present`)
check('description says the style set is open-ended', description.includes('任何其他风格'), '')
check('resource base points at the skill directory', entry?.resourceBase?.kind === 'directory' && /[/\\]openrouter-imagen[/\\]$/u.test(entry.resourceBase.path ?? ''), entry?.resourceBase?.path)

// Resolving by name is exactly what the model's `skill` tool does.
const definition = await main.registryCtx.skills.get(SKILL_NAME, {})
check('loaded definition keeps the candidate name', definition?.name === SKILL_NAME, definition?.name)
check('loaded definition carries body content', typeof definition?.content === 'string' && definition.content.length > 1000, String(definition?.content?.length))
check('body has no YAML frontmatter', !(definition?.content ?? '').startsWith('---'), (definition?.content ?? '').slice(0, 12))
check('body does not leak the frontmatter separator', !/^---[\r\n]/u.test(definition?.content ?? ''))
check('body starts at the title, with no leading blank line', /^#\s/u.test(definition?.content ?? ''), JSON.stringify((definition?.content ?? '').slice(0, 8)))
check('the registry renders it as <skill_content> for the model', renderSkillContent(definition).startsWith(`<skill_content name="${SKILL_NAME}">`))
check('body documents the tool it drives', (definition?.content ?? '').includes('openrouter_generate_imagen'))
check('body documents the reference-image contract', (definition?.content ?? '').includes('reference_files'))

// The playbook must teach a DERIVATION, not a lookup. A closed style taxonomy
// just moves the old photography-template bug up one level: the model then
// forces every request into one of the buckets instead of reading the request.
const body = definition?.content ?? ''
check('body teaches deriving the axes instead of matching a list', body.includes('不要先归类') && body.includes('靠什么被认出来') && body.includes('它没有什么'))
check('body labels its style table as examples, not a closed list', body.includes('不是清单') && body.includes('表里没有的画风'))
check('body derives styles outside its own examples', body.includes('国风水墨') && body.includes('丝网印刷'))
check('body scopes photographic gear terms to photography', body.includes('摄影器材词只属于摄影与照片级 3D'))
check('body separates in-scene light from photographic lighting', body.includes('「光线」不是摄影专属，但「布光」是'))
check('body frames the skeleton as a checklist, not a template', body.includes('检查表，不是模板'))
check('body shows non-photographic worked examples', body.includes('线条图：图标') && body.includes('卡通：贴纸'))
check('body covers cross-style conversion from a reference photo', body.includes('跨画风迁移'))
check('body says what to assume when no style is named', body.includes('用户没指定画风时'))
check('body keeps panel fields out of the prompt', body.includes('面板参数的值不要写进 prompt') && body.includes('你看不到面板的当前值'))
check('body states the default-fill rule up front', body.includes('默认只填 prompt') && body.includes('在这条消息里点名'))
check('body says leaving the optional parameters blank is correct', body.includes('「留空」是正确行为，不是遗漏'))
check('body distinguishes prompt from the optional arguments', body.includes('两样都是工具调用的参数'))
check('body defines what counts as naming a parameter', body.includes('什么叫「点名」'))
// Regression guard: "count 要花钱，一张一张来" read as a licence for the model to
// pick the image count. Owning the count is the user's job, not the model's.
check('body forbids deciding count for the user', body.includes('出几张是用户的事') && !body.includes('一张一张来'), body.includes('一张一张来') ? 'still says 一张一张来' : '')
check('body maps a conversation-named ratio to visual language', body.includes('vertical composition, tall framing'))
check('body tells the model not to guess the panel aspect ratio', body.includes('不要猜他的面板'))

// Clarity pass: the checklist used to demand 画幅 inside the prompt while 参数纪律
// forbade raw ratio values, and every worked example ended in a bare "1:1" — the
// two halves contradicted each other and the examples taught the wrong thing.
const fences = body.split('```').filter((_, i) => i % 2 === 1).join('\n')
check('worked examples keep raw ratio values out of the prompt', !/\b(?:1:1|3:2|4:3|3:4|4:5|2:3|9:16|16:9|2\.39:1)\b/.test(fences))
check('body defines 槽位 and 轴 before using either word', body.includes('槽位 = 写什么') && body.includes('轴 = 用什么词填'))
check('body scopes naming to the latest user message', body.includes('点名只认最新一条用户消息'))
check('body gives a criterion for deliverable-implied parameters', body.includes('去掉这个属性，这个词就不成立'))
check('body maps 出一张 onto the default action', body.includes('「出一张猫」') && body.includes('不用填'))
check('body separates content fixes from re-rolling luck', body.includes('原样再调一次') && body.includes('改提示词'))

// The exact wire contract: the model must know which fields the API carries, or
// it will invent them in the prompt.
const missingFromBody = API_FIELDS.filter((field) => !body.includes(`\`${field}\``))
check('body lists every API field the plugin submits', missingFromBody.length === 0, missingFromBody.join(', ') || `all ${API_FIELDS.length} present`)
check('body labels that list as the complete contract', body.includes('这是完整的清单') && body.includes('不在表里的字段 API 一概收不到'))
check('body notes seed is always submitted', body.includes('总是提交'))
check('body notes which parameters cannot be filled at all', body.includes('标「填不了」的那几个连参数都没有'))
check('body maps both reference parameters onto one API field', body.includes('两者归并成这**一个**字段'))

// The always-loaded tool description has to agree, or the model never gets far
// enough to load the skill.
check('tool description teaches the same derivation', tool.description.includes('不要往固定几类里硬塞') && tool.description.includes('靠什么被认出来'))
check('tool description scopes gear terms to photography', tool.description.includes('摄影与照片级 3D 的器材与布光'))
check('tool description offers no closed taxonomy to match against', !tool.description.includes('画风族') && !tool.description.includes('先定画风'))
check('tool description no longer hard-codes a photography structure', !tool.description.includes('商业摄影的结构'))
check('tool description frames the skeleton as a checklist', tool.description.includes('检查表不是模板'))

// Frontmatter makes the directory valid for the filesystem provider too, so it
// must stay in sync with the description the catalog actually shows.
const raw = readFileSync(SKILL_PATH, 'utf8')
const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/u.exec(raw)?.[1] ?? ''
const frontmatterName = /^name:\s*(.+)$/mu.exec(frontmatter)?.[1]?.trim()
const frontmatterDescription = /^description:\s*(.+)$/mu.exec(frontmatter)?.[1]?.trim()
check('SKILL.md has a frontmatter block', frontmatter.length > 0)
check('SKILL.md declares the same name', frontmatterName === SKILL_NAME, frontmatterName)
check('SKILL.md description matches the catalog description', frontmatterDescription === entry.description)
check('SKILL.md frontmatter is stripped from the body', !body.includes('description: 生成、绘制、修改图片'))

/* ---- graceful degradation ---- */

const noSkills = boot({ withSkills: false })
let threw = null
try {
  noSkills.ctx.skills = undefined
  mod.apply(noSkills.ctx, config())
} catch (error) {
  threw = error
}
check('a deployment without a skill registry still boots', threw === null, threw?.message)
check('the tool still registers without a skill registry', noSkills.state.tools.length === 1, String(noSkills.state.tools.length))

const optedOut = boot()
mod.apply(optedOut.ctx, config({ skills: ref(false) }))
check('`skills: false` mounts no child plugin', optedOut.state.mounts.length === 0, String(optedOut.state.mounts.length))
check('`skills: false` still registers the tool', optedOut.state.tools.length === 1, String(optedOut.state.tools.length))

/* ---- settings write path ---- */

const res = { statusCode: 0, body: '', headers: {}, setHeader(k, v) { this.headers[k] = v }, end(chunk) { this.body = String(chunk ?? '') } }
const req = Readable.from([Buffer.from(JSON.stringify({ model: 'openai/gpt-image-1', count: 2, apiKey: '', skills: 'false' }))])
req.method = 'POST'
req.url = '/openrouter-imagen/api/config'
req.headers = { host: '127.0.0.1:63784', origin: 'http://127.0.0.1:63784' }
await main.state.routes[0].handler(req, res)
const payload = JSON.parse(res.body || '{}')
check('config POST is accepted', payload.ok === true, payload.error)
check('settings.update was called once', main.state.updates.length === 1, String(main.state.updates.length))
check('settings.update targets the profile row id', main.state.updates[0]?.ns === NS, main.state.updates[0]?.ns)
check('blank apiKey never reaches settings.update', main.state.updates[0]?.patch?.apiKey === undefined, JSON.stringify(main.state.updates[0]?.patch))
check('count is coerced to a number', main.state.updates[0]?.patch?.count === 2, String(main.state.updates[0]?.patch?.count))
check('skills is coerced to a boolean', main.state.updates[0]?.patch?.skills === false, JSON.stringify(main.state.updates[0]?.patch?.skills))
check('model is forwarded', main.state.updates[0]?.patch?.model === 'openai/gpt-image-1', main.state.updates[0]?.patch?.model)
check('the response never echoes the key', Object.prototype.hasOwnProperty.call(payload.config ?? {}, 'apiKey') === false)
check('hasKey reports key absence', payload.hasKey === false, String(payload.hasKey))
check('namespace is reported for the client', payload.namespace === NS, payload.namespace)
check('the skills toggle round-trips to the client', payload.config?.skills === true, JSON.stringify(payload.config?.skills))

/* ---- the model palette ---- */

const paletteRes = { statusCode: 0, body: '', headers: {}, setHeader(k, v) { this.headers[k] = v }, end(chunk) { this.body = String(chunk ?? '') } }
const paletteReq = Readable.from([Buffer.from(JSON.stringify({ models: ['a/model', ' a/model ', 'b/model', '', 42] }))])
paletteReq.method = 'POST'
paletteReq.url = '/openrouter-imagen/api/config'
paletteReq.headers = { host: '127.0.0.1:63784', origin: 'http://127.0.0.1:63784' }
await main.state.routes[0].handler(paletteReq, paletteRes)
const palettePayload = JSON.parse(paletteRes.body || '{}')
check('a models POST is accepted', palettePayload.ok === true, palettePayload.error)
check(
  'the palette is trimmed, deduped and string-only',
  JSON.stringify(main.state.updates.at(-1)?.patch?.models) === JSON.stringify(['a/model', 'b/model']),
  JSON.stringify(main.state.updates.at(-1)?.patch?.models),
)

const paletteBoot = boot()
mod.apply(paletteBoot.ctx, config({ models: ref(['x/model', 'y/model']) }))
const paletteGet = { statusCode: 0, body: '', headers: {}, setHeader(k, v) { this.headers[k] = v }, end(chunk) { this.body = String(chunk ?? '') } }
const paletteGetReq = Readable.from([])
paletteGetReq.method = 'GET'
paletteGetReq.url = '/openrouter-imagen/api/config'
paletteGetReq.headers = { host: '127.0.0.1:63784', origin: 'http://127.0.0.1:63784' }
await paletteBoot.state.routes[0].handler(paletteGetReq, paletteRes)
const paletteView = JSON.parse(paletteRes.body || '{}')
check(
  'GET /config reports the model palette to the browser',
  JSON.stringify(paletteView.config?.models) === JSON.stringify(['x/model', 'y/model']),
  JSON.stringify(paletteView.config?.models),
)

console.log(`\n${failures.length === 0 ? 'ALL CHECKS PASSED' : `${failures.length} CHECK(S) FAILED`}`)
process.exit(failures.length === 0 ? 0 : 1)
