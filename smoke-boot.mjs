/**
 * Boot smoke test for the dsh 0.1.7 contract.
 *
 * Loads the real host half, runs `apply` against a stub Context that mirrors the
 * 0.1.7 service shapes, and asserts the calls the plugin makes are the ones the
 * runtime actually exposes:
 *
 *   - `ctx.settings.register` must never be called (it no longer exists);
 *   - the exported Config must be a volatile form, which is what makes the
 *     settings service treat the row as editable;
 *   - `ctx.tools.register` must receive a well-formed tool;
 *   - the reported namespace must equal the profile row id, which is what
 *     `ctx.settings.update(ns, patch)` resolves against.
 */
const NS = 'openrouter-imagen'
const failures = []
const check = (label, ok, detail) => {
  if (!ok) failures.push(label)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : ` — ${detail}`}`)
}
/** One volatile reference, shaped exactly like cosmokit's createVolatile. */
const ref = (value) => ({ get: () => value })

const registeredTools = []
const cache = new Map()
const handlers = []
const updates = []

const stubContext = {
  effect(fn) {
    const dispose = fn()
    return typeof dispose === 'function' ? dispose : () => {}
  },
  get(name) {
    if (name === 'settings') return { update: async (ns, patch) => updates.push({ ns, patch }) }
    if (name === 'attachments') return { saveImages: async () => [], saveFile: async () => undefined, fileHostPath: () => '' }
    if (name === 'webServer') return { register: (route) => handlers.push(route) }
    if (name === 'fs') return { readFile: async () => '' }
    if (name === 'connection') return { requestRejection: () => undefined }
    return undefined
  },
  inject() {},
  settings: {
    // The removed API: reaching it must fail loudly rather than silently.
    register() {
      throw new Error('ctx.settings.register must not be called on dsh >= 0.1.7')
    },
  },
  tools: {
    register(tool) {
      registeredTools.push(tool)
      return () => {}
    },
  },
}

const config = {
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
}

const mod = await import('./lib/index.js')

check('exports a Config schema', mod.Config !== undefined)
check('does not require the removed `settings` service', !(mod.inject ?? []).includes('settings'), JSON.stringify(mod.inject))

// Mirrors dsh-settings volatileForm: a row is editable only if some field is volatile.
const volatileKeys = Object.entries(mod.Config.dict ?? {}).filter(([, s]) => s.meta?.volatile === true).map(([k]) => k)
check('every declared field is volatile (row is editable)', volatileKeys.length === Object.keys(mod.Config.dict).length, `${volatileKeys.length}/${Object.keys(mod.Config.dict).length}`)

mod.apply(stubContext, config)

check('registers exactly one tool', registeredTools.length === 1, String(registeredTools.length))
const tool = registeredTools[0]
check('tool carries the expected name', tool?.name === 'openrouter_generate_imagen', tool?.name)
check('tool is a closed object schema', tool?.parameters?.type === 'object', tool?.parameters?.type)
check('tool declares output render', typeof tool?.output?.render === 'function')
check('mounts the browser API route', handlers.length === 1, String(handlers.length))
check('route path is the client API root', handlers[0]?.path === '/openrouter-imagen/api', handlers[0]?.path)
check('route is a prefix route', handlers[0]?.kind === 'prefix', handlers[0]?.kind)

// Exercise the settings write path the client's /config POST uses.
const { Readable } = await import('node:stream')
const res = { statusCode: 0, body: '', headers: {}, setHeader(k, v) { this.headers[k] = v }, end(chunk) { this.body = String(chunk ?? '') } }
const req = Readable.from([Buffer.from(JSON.stringify({ model: 'openai/gpt-image-1', count: 2, apiKey: '' }))])
req.method = 'POST'
req.url = '/openrouter-imagen/api/config'
req.headers = { host: '127.0.0.1:63784', origin: 'http://127.0.0.1:63784' }
await handlers[0].handler(req, res)
const payload = JSON.parse(res.body || '{}')
check('config POST is accepted', payload.ok === true, payload.error)
check('settings.update was called once', updates.length === 1, String(updates.length))
check('settings.update targets the profile row id', updates[0]?.ns === NS, updates[0]?.ns)
check('blank apiKey never reaches settings.update', updates[0]?.patch?.apiKey === undefined, JSON.stringify(updates[0]?.patch))
check('count is coerced to a number', updates[0]?.patch?.count === 2, String(updates[0]?.patch?.count))
check('model is forwarded', updates[0]?.patch?.model === 'openai/gpt-image-1', updates[0]?.patch?.model)
check('the response never echoes the key', Object.prototype.hasOwnProperty.call(payload.config ?? {}, 'apiKey') === false)
check('hasKey reports key absence', payload.hasKey === false, String(payload.hasKey))
check('namespace is reported for the client', payload.namespace === NS, payload.namespace)

console.log(`\n${failures.length === 0 ? 'ALL CHECKS PASSED' : `${failures.length} CHECK(S) FAILED`}`)
process.exit(failures.length === 0 ? 0 : 1)
