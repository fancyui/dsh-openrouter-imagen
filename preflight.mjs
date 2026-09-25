/**
 * Pre-flight harness for dsh-openrouter-imagen's Host half.
 *
 * Runs the real plugin against a local mock of the OpenRouter API, so the whole
 * request path is asserted — settings → request body → response decode →
 * attachment commit → staged-reference consumption — without a live account and
 * without starting DSH.
 *
 * The mock is reached through OPENROUTER_IMAGE_API_BASE, and NO_PROXY keeps the
 * machine's own egress proxy out of the way for loopback (which doubles as a
 * check that the proxy agent honours no_proxy).
 */
import { mkdtemp, readdir, stat } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** Project root, derived from this file so the harness runs from any checkout. */
const ROOT = dirname(fileURLToPath(import.meta.url))

/** 1x1 transparent PNG. */
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=='

const captured = { requests: [] }

const mock = createServer((req, res) => {
  const chunks = []
  req.on('data', (chunk) => chunks.push(chunk))
  req.on('end', () => {
    const raw = Buffer.concat(chunks).toString('utf8')
    let body = null
    try {
      body = raw.length > 0 ? JSON.parse(raw) : null
    } catch {
      body = { __unparsable: raw.slice(0, 120) }
    }
    captured.requests.push({ method: req.method, url: req.url, body, authorization: req.headers.authorization ?? null })

    const send = (payload) => {
      res.statusCode = 200
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(payload))
    }
    if (req.url === '/images' && req.method === 'POST') {
      return send({
        created: 1,
        data: [{ b64_json: PNG_B64, media_type: 'image/png' }],
        usage: { prompt_tokens: 0, completion_tokens: 10, total_tokens: 10, cost: 0.0123 },
      })
    }
    if (req.url === '/key') return send({ data: { label: 'preflight-key', usage: 1.5, limit: 10, limit_remaining: 8.5 } })
    if (req.url === '/images/models') return send({ data: [{ id: 'z/model', name: 'Z' }, { id: 'a/model', name: 'A' }] })
    res.statusCode = 404
    res.end(JSON.stringify({ error: { message: `unexpected ${req.method} ${req.url}` } }))
  })
})

await new Promise((resolve) => mock.listen(0, '127.0.0.1', resolve))
const port = mock.address().port
process.env.OPENROUTER_IMAGE_API_BASE = `http://127.0.0.1:${port}`
process.env.NO_PROXY = '127.0.0.1,localhost'
process.env.no_proxy = '127.0.0.1,localhost'

let failures = 0
const check = (label, ok, detail) => {
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : ` — ${detail}`}`)
}

/* ---------- a cordis context that enforces the inject guard ---------- */

const registered = { tools: [], routes: [], plugins: [] }

const baseConfig = {
  apiKey: '',
  model: 'google/gemini-2.5-flash-image',
  models: [],
  resolution: '1K',
  aspectRatio: 'auto',
  quality: 'auto',
  outputFormat: 'png',
  count: 1,
  background: 'auto',
  seed: '',
  providerSort: '',
  extraJson: '',
  saveDir: 'generated-images',
  skills: true,
}

/**
 * dsh ≥ 0.1.7 hands `apply` the live configuration as volatile references, not
 * as plain values, and reads go through `ref.get()`. Building one ref per field
 * over `baseConfig` keeps this harness faithful: a `settings.update()` write
 * lands in `baseConfig` and the next read sees it, exactly like the real loader.
 * Passing a bare `{}` here is what silently emptied every config read.
 */
const volatileConfig = Object.fromEntries(Object.entries(baseConfig).map(([key]) => [key, { get: () => baseConfig[key] }]))

const webServer = {
  register: (route) => {
    registered.routes.push(route)
    return () => {}
  },
}

const attachments = {
  async saveImages(inputs) {
    return inputs.map((input, index) => ({
      attachmentId: `att-${index}`,
      mediaType: input.mediaType,
      bytes: input.data.length,
      width: 1,
      height: 1,
      name: input.name,
    }))
  },
  async saveFile(input) {
    return { attachmentId: 'file-1', name: input.name, bytes: input.data.length }
  },
  fileHostPath(ref) {
    return `C:/mock/${ref.name}`
  },
}

/**
 * The browser trust fence, driven by the test: `undefined` means an
 * authenticated same-origin browser, a number is the status it refuses with.
 */
const connection = {
  rejection: undefined,
  requestRejection: () => connection.rejection,
}

/**
 * Path resolution for `reference_files`; contents are irrelevant to the policy
 * check. This mirrors the REAL dsh-fs-local contract: `resolve` returns a
 * handle `{ targetKey, displayPath }` — an object, not a string — and
 * `readBytes` receives that handle. A string-returning stub once hid a
 * `String(handle)` bug that made every in-workspace reference fail.
 */
const fs = {
  async resolve(raw, opts) {
    const base = typeof opts?.cwd === 'string' && opts.cwd.length > 0 ? opts.cwd : 'C:\\'
    const displayPath = isAbsolute(raw) ? resolve(raw) : resolve(base, raw)
    return { targetKey: displayPath.toLowerCase(), displayPath }
  },
  async readBytes(target) {
    if (typeof target !== 'object' || target === null || typeof target.targetKey !== 'string') {
      throw new Error('readBytes requires a resolved handle, got ' + typeof target)
    }
    return new Uint8Array([1, 2, 3])
  },
}

const rawCtx = {
  settings: {
    register: (ns, schema, options) => ({
      get: () => ({ ...baseConfig, ...(options?.base ?? {}) }),
      update: async (patch) => {
        Object.assign(baseConfig, patch)
      },
    }),
  },
  tools: {
    register: (tool) => {
      registered.tools.push(tool)
      return () => {}
    },
  },
  /** The bundled skill half is mounted through `ctx.plugin()`, so the guard has to allow it. */
  plugin: (mod) => {
    registered.plugins.push(mod)
  },
  get: (name) =>
    name === 'webServer'
      ? webServer
      : name === 'settings'
        ? { update: async (ns, patch) => Object.assign(baseConfig, patch) }
        : name === 'attachments'
          ? attachments
          : name === 'connection'
            ? connection
            : name === 'fs'
              ? fs
              : undefined,
  // Dynamic injection must actually PROVIDE the requested service inside the
  // callback scope, or the fallback branch looks broken when only the harness is.
  inject: (deps, callback) => {
    const requested = Array.isArray(deps) ? deps : []
    const scoped = new Proxy(rawCtx, {
      get(target, prop, receiver) {
        if (prop === 'get') return (name) => (requested.includes(name) ? webServer : target.get(name))
        if (typeof prop === 'symbol' || prop in target) return Reflect.get(target, prop, receiver)
        if (requested.includes(prop)) return webServer
        throw new Error(`cannot get property "${String(prop)}" without inject`)
      },
    })
    return callback(scoped)
  },
  effect: (fn) => {
    const dispose = fn()
    return typeof dispose === 'function' ? dispose : () => {}
  },
}

/**
 * Declared services and lifecycle verbs read normally; anything else throws the
 * guard's own message. Optional chaining does not survive this — the proxy
 * throws on `get`, so `ctx.logger?.warn?.()` detonates here just like at boot.
 */
const ctx = new Proxy(rawCtx, {
  get(target, prop, receiver) {
    if (typeof prop === 'symbol' || prop in target) return Reflect.get(target, prop, receiver)
    throw new Error(`cannot get property "${String(prop)}" without inject`)
  },
})

/* ---------- drive the plugin's own HTTP route ---------- */

function fakeRes() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(key, value) {
      this.headers[key] = value
    },
    end(body) {
      this.body = body ?? ''
    },
  }
}

async function call(route, method, path, body) {
  const res = fakeRes()
  const listeners = {}
  const payload = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
  const req = {
    method,
    url: path,
    on(event, handler) {
      listeners[event] = handler
      return req
    },
    destroy() {},
  }
  const done = route.handler(req, res)
  await Promise.resolve()
  if (listeners.data !== undefined) {
    for (const chunk of payload) listeners.data(chunk)
    listeners.end?.()
  }
  await done
  return { status: res.statusCode, json: JSON.parse(res.body) }
}

const mod = await import(pathToFileURL(join(ROOT, 'lib', 'index.js')).href)
mod.apply(ctx, volatileConfig)

const route = registered.routes[0]
check('model tool registered', registered.tools.some((tool) => tool.name === 'openrouter_generate_imagen'))
check('api route registered', route !== undefined, registered.routes.map((r) => `${r.kind} ${r.path}`).join(', '))
check(
  'bundled skill half mounted as a child plugin',
  registered.plugins.length === 1 && registered.plugins[0]?.name === 'openrouter-imagen-skills',
  registered.plugins.map((plugin) => plugin?.name).join(', ') || 'none mounted',
)

/* config round-trip */
const before = await call(route, 'GET', '/openrouter-imagen/api/config')
check('GET /config hides the key', before.json.hasKey === false && before.json.config.apiKey === undefined)

/* the trust fence the shipped routes use: a foreign origin must not be able to
 * spend the key through /generate, nor rewrite the settings through /config */
const imagesBefore = captured.requests.filter((entry) => entry.url === '/images').length
connection.rejection = 403
const fenced = await call(route, 'GET', '/openrouter-imagen/api/config')
check('a foreign origin is fenced out of the api route', fenced.status === 403 && fenced.json.ok === false, JSON.stringify(fenced.json))
const fencedGenerate = await call(route, 'POST', '/openrouter-imagen/api/generate', { prompt: 'not mine' })
check(
  'a fenced request never reaches the provider',
  fencedGenerate.status === 403 && captured.requests.filter((entry) => entry.url === '/images').length === imagesBefore,
  String(fencedGenerate.status),
)
connection.rejection = 401
const unauthenticated = await call(route, 'POST', '/openrouter-imagen/api/config', { model: 'evil/model' })
check('an unauthenticated browser is refused with 401', unauthenticated.status === 401, String(unauthenticated.status))
connection.rejection = undefined
const trusted = await call(route, 'GET', '/openrouter-imagen/api/config')
check('a trusted browser still reads the config', trusted.status === 200 && trusted.json.ok === true, String(trusted.status))

const saved = await call(route, 'POST', '/openrouter-imagen/api/config', {
  apiKey: 'sk-preflight',
  model: 'openai/gpt-image-1',
  count: 3,
  resolution: '2K',
  aspectRatio: '16:9',
  quality: 'high',
  outputFormat: 'jpeg',
  background: 'transparent',
  seed: '42',
  providerSort: 'price',
  extraJson: '{"negative_prompt":"模糊"}',
  saveDir: 'generated-images',
})
check('POST /config persists', saved.json.ok === true && saved.json.hasKey === true && saved.json.config.count === 3, JSON.stringify(saved.json.config))

/* staged reference from the composer */
const staged = await call(route, 'POST', '/openrouter-imagen/api/reference', {
  references: [{ mediaType: 'image/png', data: PNG_B64 }],
})
check('POST /reference stages one image', staged.json.ok === true && staged.json.count === 1, JSON.stringify(staged.json))

const listed = await call(route, 'GET', '/openrouter-imagen/api/reference')
check('GET /reference reports metadata only', listed.json.count === 1 && listed.json.references[0].dataUrl === undefined, JSON.stringify(listed.json))

/* the generation itself, against the mock */
const generated = await call(route, 'POST', '/openrouter-imagen/api/generate', { prompt: 'a probe image' })
check('POST /generate succeeds', generated.json.ok === true, generated.json.error ?? '')
// The browser response deliberately omits the durable attachment ref; the
// presence of a host file path is what proves the attachment branch ran.
check(
  'generation commits the image through the attachments service',
  typeof generated.json.images?.[0]?.filePath === 'string' && generated.json.images[0].bytes > 0,
  JSON.stringify({ filePath: generated.json.images?.[0]?.filePath, bytes: generated.json.images?.[0]?.bytes }),
)
check('cost is surfaced', generated.json.cost === 0.0123, String(generated.json.cost))
check('staged reference is reported as used', generated.json.referenceCount === 1, String(generated.json.referenceCount))

const sent = captured.requests.find((entry) => entry.url === '/images' && entry.method === 'POST')
const body = sent?.body ?? {}
check('request carries the bearer key', sent?.authorization === 'Bearer sk-preflight', String(sent?.authorization))
check('model reaches the body', body.model === 'openai/gpt-image-1', String(body.model))
check('count 3 becomes n=3', body.n === 3, String(body.n))
check(
  'resolution / aspect / quality / format',
  body.resolution === '2K' && body.aspect_ratio === '16:9' && body.quality === 'high' && body.output_format === 'jpeg',
  JSON.stringify({ resolution: body.resolution, aspect_ratio: body.aspect_ratio, quality: body.quality, output_format: body.output_format }),
)
check('provider sort, background, seed and extraJson merge', body.provider?.sort === 'price' && body.background === 'transparent' && body.seed === 42 && body.negative_prompt === '模糊', JSON.stringify({ provider: body.provider, background: body.background, seed: body.seed, negative_prompt: body.negative_prompt }))
check(
  'staged reference becomes input_references',
  Array.isArray(body.input_references) &&
    body.input_references.length === 1 &&
    String(body.input_references[0]?.image_url?.url).startsWith('data:image/png;base64,'),
  JSON.stringify(body.input_references?.map((r) => String(r?.image_url?.url).slice(0, 32))),
)

const after = await call(route, 'GET', '/openrouter-imagen/api/reference')
check('staged reference is consumed on success', after.json.count === 0, String(after.json.count))

/* the seed: a fixed box is sent as-is, an empty box draws one and reports it */
check(
  'a fixed seed is echoed with the result',
  generated.json.seed === 42 && generated.json.seedRandom === false,
  JSON.stringify({ seed: generated.json.seed, seedRandom: generated.json.seedRandom }),
)
await call(route, 'POST', '/openrouter-imagen/api/config', { seed: '' })
const drawn = await call(route, 'POST', '/openrouter-imagen/api/generate', { prompt: 'random seed probe' })
const drawnBody = captured.requests.filter((entry) => entry.url === '/images' && entry.method === 'POST').pop()?.body ?? {}
check(
  'an empty seed box draws a seed and reports it back',
  Number.isInteger(drawnBody.seed) &&
    drawnBody.seed > 0 &&
    drawn.json.seed === drawnBody.seed &&
    drawn.json.seedRandom === true,
  JSON.stringify({ sent: drawnBody.seed, reported: drawn.json.seed, seedRandom: drawn.json.seedRandom }),
)
await call(route, 'POST', '/openrouter-imagen/api/config', { seed: '42' })

/* the model palette: when 模型 itself is empty, the first palette entry is the default */
const paletteWrite = await call(route, 'POST', '/openrouter-imagen/api/config', {
  model: '',
  models: ['pre/a-model', ' pre/a-model ', 'pre/b-model', '', 42],
})
check(
  'the palette write is trimmed, deduped and string-only',
  paletteWrite.json.ok === true && JSON.stringify(paletteWrite.json.config?.models) === JSON.stringify(['pre/a-model', 'pre/b-model']),
  JSON.stringify(paletteWrite.json.config?.models),
)
const paletteRun = await call(route, 'POST', '/openrouter-imagen/api/generate', { prompt: 'palette probe' })
const paletteBody = captured.requests.filter((entry) => entry.url === '/images' && entry.method === 'POST').pop()?.body ?? {}
check(
  'an empty 模型 falls back to the first palette entry',
  paletteRun.json.ok === true && paletteRun.json.params?.model === 'pre/a-model' && paletteBody.model === 'pre/a-model',
  JSON.stringify({ params: paletteRun.json.params?.model, body: paletteBody.model, error: paletteRun.json.error }),
)
await call(route, 'POST', '/openrouter-imagen/api/config', { model: 'openai/gpt-image-1', models: [] })

/* the remaining endpoints */
const keyTest = await call(route, 'GET', '/openrouter-imagen/api/test')
check('GET /test reports the key limits', keyTest.json.ok === true && keyTest.json.report.includes('preflight-key'), keyTest.json.report ?? keyTest.json.error)

const models = await call(route, 'GET', '/openrouter-imagen/api/models')
check('GET /models sorts the catalog', models.json.count === 2 && models.json.models[0].id === 'a/model', JSON.stringify(models.json.models))

/* the tool's own render path */
const tool = registered.tools[0]
const errorBlocks = tool.output.render({}, { ok: false, error: '示例错误' })
check('tool renders a failure as text', errorBlocks[0]?.type === 'text' && errorBlocks[0].text.includes('示例错误'))
const okBlocks = tool.output.render(
  {},
  { ok: true, model: 'm', elapsedMs: 2000, referenceCount: 1, cost: 0.5, images: [{ name: 'a.png', attachment: { attachmentId: 'att-0' } }] },
)
check('tool renders an image block', okBlocks.length === 2 && okBlocks[1].type === 'image' && okBlocks[1].attachment.attachmentId === 'att-0')
const projectBlocks = tool.output.render(
  {},
  {
    ok: true,
    model: 'm',
    elapsedMs: 2000,
    referenceCount: 0,
    outputDir: 'X:\\proj\\generated-images',
    outputDirRelative: 'generated-images',
    seed: 12345,
    seedRandom: false,
    images: [{ name: 'a.png', filePath: 'X:\\proj\\generated-images\\a.png', attachment: { attachmentId: 'att-0' } }],
  },
)
check(
  'tool text carries the save folder, the seed and the file list',
  projectBlocks[0].text.includes('保存目录：X:\\proj\\generated-images') &&
    projectBlocks[0].text.includes('文件：X:\\proj\\generated-images\\a.png') &&
    projectBlocks[0].text.includes('种子：12345') &&
    projectBlocks[0].text.indexOf('种子：') < projectBlocks[0].text.indexOf('文件：'),
  JSON.stringify(projectBlocks[0].text),
)

/* the tool's own execute path must hand the model a durable attachment ref */
const toolRun = await tool.execute({ prompt: 'from the tool', reference_images: [] }, undefined)
check(
  'tool execute returns a durable attachment ref',
  toolRun.ok === true && toolRun.images?.[0]?.attachment?.attachmentId === 'att-0',
  JSON.stringify(toolRun.images?.[0] ?? toolRun),
)
check(
  'a caller with no session workspace stays in the attachment store',
  toolRun.outputDir === undefined && String(toolRun.images?.[0]?.filePath).startsWith('C:/mock/'),
  JSON.stringify({ outputDir: toolRun.outputDir, filePath: toolRun.images?.[0]?.filePath }),
)
check('tool execute reports the seed it used', Number.isInteger(toolRun.seed) && toolRun.seed > 0, String(toolRun.seed))

/* The conversation model cannot see the composer panel, so the result has to
   carry the parameters that were really sent — and a per-call override has to
   win over the panel. The tool declares snake_case (`aspect_ratio`) while the
   panel config uses camelCase, which once made every override a no-op. */
check(
  'the panel aspect ratio is used when the call omits one',
  toolRun.params?.aspect_ratio === '16:9' && toolRun.params?.resolution === '2K',
  JSON.stringify(toolRun.params),
)
const overrideRun = await tool.execute({ prompt: 'override probe', aspect_ratio: '1:1', resolution: '512' }, undefined)
const overrideBody = captured.requests.filter((entry) => entry.url === '/images' && entry.method === 'POST').pop()?.body ?? {}
check(
  'a per-call aspect_ratio really overrides the panel on the wire',
  overrideBody.aspect_ratio === '1:1' && overrideBody.resolution === '512' && overrideRun.params?.aspect_ratio === '1:1',
  JSON.stringify({ body: { aspect_ratio: overrideBody.aspect_ratio, resolution: overrideBody.resolution }, params: overrideRun.params }),
)
// The tool's declared spelling is snake_case (a camelCase argument is refused
// as undeclared, asserted below); the JSON route keeps accepting camelCase.
const camelRoute = await call(route, 'POST', '/openrouter-imagen/api/generate', { prompt: 'camel probe', aspectRatio: '9:16' })
const camelBody = captured.requests.filter((entry) => entry.url === '/images' && entry.method === 'POST').pop()?.body ?? {}
check(
  'the camelCase spelling still reaches the wire through the JSON route',
  camelBody.aspect_ratio === '9:16' && camelRoute.json.params?.aspect_ratio === '9:16',
  JSON.stringify({ body: camelBody.aspect_ratio, params: camelRoute.json.params?.aspect_ratio }),
)
const camelTool = await tool.execute({ prompt: 'camel tool probe', aspectRatio: '9:16' }, undefined)
check(
  'the tool refuses camelCase and names the declared spelling',
  camelTool.ok === false && String(camelTool.error).includes('未知参数：aspectRatio'),
  camelTool.error ?? '',
)
const paramBlocks = tool.output.render(
  {},
  { ok: true, model: 'm', elapsedMs: 1000, referenceCount: 0, params: { resolution: '2K', aspect_ratio: '4:3', quality: 'high', count: 2 }, images: [] },
)
check(
  'tool text carries the parameters actually sent',
  paramBlocks[0].text.includes('参数：2K · 4:3 · high · 2 张'),
  JSON.stringify(paramBlocks[0].text),
)
check(
  'the description forbids describing the reference image and asks for a one-line reply',
  tool.description.includes('不要在文字里复述参考图') && tool.description.includes('回复一句话'),
  tool.description.slice(0, 120),
)
// The prompt guidance must teach a DERIVATION, not a lookup. A closed style
// taxonomy just moves the old photography-template bug up one level: the model
// then forces every request into one of the buckets instead of reading it.
check(
  'the description tells the model to derive the axes, not match a style list',
  tool.description.includes('不要往固定几类里硬塞') &&
    tool.description.includes('靠什么被认出来') &&
    tool.description.includes('它没有什么'),
  '',
)
check(
  'the description scopes photographic gear terms to photography',
  tool.description.includes('摄影与照片级 3D 的器材与布光') && tool.description.includes('「布光」是摄影专属'),
  '',
)
check(
  'the description no longer hard-codes a commercial-photography structure',
  !tool.description.includes('商业摄影的结构'),
  '',
)
check(
  'the description offers no closed style taxonomy to match against',
  !tool.description.includes('画风族') && !tool.description.includes('先定画风'),
  '',
)
check(
  'the description frames the prompt skeleton as a checklist, not a template',
  tool.description.includes('检查表不是模板') &&
    ['主体与动作', '媒介与画风', '构图与取景', '色彩与影调', '细节与质感'].every((part) => tool.description.includes(part)),
  '',
)
// Must mirror buildBody() in lib/index.js: the model has to know which fields the
// API carries, or it invents them in the prompt.
const API_FIELDS = ['model', 'n', 'resolution', 'aspect_ratio', 'quality', 'output_format', 'background', 'seed', 'provider', 'input_references']
check(
  'the description names every API field the plugin submits',
  API_FIELDS.every((field) => tool.description.includes(`\`${field}\``)),
  API_FIELDS.filter((field) => !tool.description.includes(`\`${field}\``)).join(', ') || `all ${API_FIELDS.length} present`,
)
check(
  'the description makes the user panel the default and forbids picking parameters for him',
  tool.description.includes('默认只填 `prompt`') &&
    tool.description.includes('留空就是用面板的值') &&
    tool.description.includes('那是用户的设置，不是你的决定'),
  tool.description.slice(tool.description.indexOf('默认只填')),
)
check(
  'the description says leaving the optional parameters blank is correct',
  tool.description.includes('留空是正确行为、不是遗漏'),
  '',
)
check(
  'the description forbids deciding the image count for the user',
  tool.description.includes('不要自己判断「这次适合出几张」'),
  '',
)
check(
  'the description keeps panel fields out of the prompt and says why',
  tool.description.includes('面板参数的值也不要写进 prompt') && tool.description.includes('看不到面板当前的值'),
  '',
)
// The override parameters stay available for the cases the user asks for by
// name, but each one has to say "omit unless he asked" — that wording is the
// contract that keeps the model from quietly re-deciding the panel's values.
const hostSource = readFileSync(join(ROOT, 'lib', 'index.js'), 'utf8')
const OVERRIDES = ['model', 'count', 'resolution', 'aspect_ratio', 'quality', 'background', 'seed']
const undisciplined = OVERRIDES.filter((key) => {
  const declaration = hostSource
    .split('\n')
    .find((line) => line.trimStart().startsWith(`${key}: {`) && line.includes('description:'))
  const text = declaration ?? ''
  return !text.includes('Omit unless') && !text.includes('Pass it only when')
})
check(
  'every override parameter tells the model to omit it unless the user asked',
  undisciplined.length === 0,
  undisciplined.length === 0 ? `${OVERRIDES.length} parameters` : `missing on: ${undisciplined.join(', ')}`,
)
check(
  '取景 alone is not a licence to pick a ratio',
  tool.parameters?.aspect_ratio?.description?.includes('全身照') ||
    hostSource.includes('主体取景（例如「全身照」）不算'),
  '',
)

/* with a session workspace, the picture belongs to the project */
const workspace = await mkdtemp(join(tmpdir(), 'dsh-oi-preflight-'))
const exec = { agent: { session: { header: { cwd: workspace } } } }
const inProject = await tool.execute({ prompt: 'into the project', reference_images: [] }, exec)
const projectDir = join(workspace, 'generated-images')
check(
  'a session workspace moves the file into the project',
  inProject.ok === true && inProject.outputDir === projectDir && inProject.outputDirRelative === 'generated-images',
  JSON.stringify({ outputDir: inProject.outputDir, relative: inProject.outputDirRelative, error: inProject.error }),
)
const writtenPath = inProject.images?.[0]?.filePath ?? ''
const written = writtenPath === '' ? null : await stat(writtenPath).catch(() => null)
check(
  'the project file really exists with the reported bytes',
  written !== null && written.size === inProject.images[0].bytes && basename(writtenPath).startsWith('openrouter-'),
  JSON.stringify({ writtenPath, size: written?.size ?? null, reported: inProject.images?.[0]?.bytes }),
)
// Two generations inside one second share a timestamp; the second must not
// silently replace the first.
const second = await tool.execute({ prompt: 'again', reference_images: [] }, exec)
const inFolder = await readdir(projectDir)
check(
  'a second generation never overwrites the first',
  second.ok === true && inFolder.length === 2 && inFolder.includes(basename(writtenPath)),
  JSON.stringify(inFolder),
)

/* the tool's own boundary: closed parameters, confined local reads */
const bogus = await tool.execute({ prompt: 'x', image_size: '1024x1024' }, undefined)
check('an undeclared tool parameter is refused', bogus.ok === false && String(bogus.error).includes('未知参数'), bogus.error ?? '')
const outside = await tool.execute(
  { prompt: 'x', reference_files: ['C:\\Windows\\win.ini'] },
  { agent: { session: { header: { cwd: workspace } } } },
)
check(
  'reference_files cannot read outside the session workspace',
  outside.ok === false && String(outside.error).includes('会话工作目录'),
  outside.error ?? '',
)
const insideRead = await tool.execute(
  { prompt: 'x', reference_files: [join(workspace, 'reference.png')] },
  { agent: { session: { header: { cwd: workspace } } } },
)
check('reference_files still reads inside the session workspace', insideRead.ok === true, insideRead.error ?? '')

/* emptying 保存目录 opts out of project storage without failing the call */
const emptied = await call(route, 'POST', '/openrouter-imagen/api/config', { saveDir: '' })
check('保存目录 can be emptied through the config route', emptied.json.ok === true && emptied.json.config.saveDir === '', JSON.stringify(emptied.json.config))
const optedOut = await tool.execute({ prompt: 'nowhere in particular', reference_images: [] }, exec)
check(
  'an empty 保存目录 falls back to the attachment store',
  optedOut.ok === true && optedOut.outputDir === undefined && String(optedOut.images?.[0]?.filePath).startsWith('C:/mock/'),
  JSON.stringify({ outputDir: optedOut.outputDir, filePath: optedOut.images?.[0]?.filePath }),
)
await call(route, 'POST', '/openrouter-imagen/api/config', { saveDir: 'generated-images' })

/* `extraJson` is a pass-through hatch, not a way to swap the model or prompt */
await call(route, 'POST', '/openrouter-imagen/api/config', { extraJson: '{"model":"evil/model"}' })
const overridden = await call(route, 'POST', '/openrouter-imagen/api/generate', { prompt: 'probe' })
check(
  '附加参数 cannot silently override the model',
  overridden.json.ok === false && String(overridden.json.error).includes('不能覆盖'),
  overridden.json.error ?? '',
)
await call(route, 'POST', '/openrouter-imagen/api/config', { extraJson: '{"negative_prompt":"模糊"}' })

/* a keyless call still fails before any network work */
baseConfig.apiKey = ''
const keyless = await call(route, 'POST', '/openrouter-imagen/api/generate', { prompt: 'x' })
check('keyless generate gives the guidance error', keyless.json.ok === false && keyless.json.error.includes('API Key'), keyless.json.error)

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
// The mock is left listening but unref'd: closing it while undici still holds
// keep-alive sockets trips a libuv teardown assertion on Windows, and an abrupt
// process.exit() trips it too. Letting the loop drain keeps the exit code
// truthful, which is what makes this runnable from a script.
mock.unref()
process.exitCode = failures === 0 ? 0 : 1
