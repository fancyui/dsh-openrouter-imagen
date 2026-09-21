/**
 * dsh-openrouter-imagen — Client half.
 *
 * One first-class Settings page (Settings → 图像生成) backed by the Host half's
 * same-origin JSON route under `/openrouter-image/api`. This module is
 * self-contained by hand — no bundler — so the client module system wraps it
 * in a CJS factory and the kernel adopts `{ apply, inject }` as a client
 * plugin.
 *
 * The API key is write-only: the Host never sends it back, the input starts
 * empty, and a blank value means "leave the stored key untouched".
 */
window.__ModuleLoader__.load({
  id: 'dsh-openrouter-imagen',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const h = React.createElement

    const API = '/openrouter-image/api'
    const MAX_REFS = 4
    const MAX_REF_BYTES = 6 * 1024 * 1024
    const RESOLUTIONS = ['auto', '512', '1K', '2K', '4K']
    const ASPECTS = ['auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '4:5', '5:4', '21:9', '9:21']
    const QUALITIES = ['auto', 'low', 'medium', 'high']
    const FORMATS = ['png', 'jpeg', 'webp']
    const BACKGROUNDS = ['auto', 'transparent', 'opaque']
    const SORTS = ['', 'price', 'throughput', 'latency']
    /** Zipper for the few option values that read better in Chinese. */
    const OPTION_LABELS = { auto: '自动', transparent: '透明', opaque: '不透明' }

    const CSS = [
      '.dsh-oi-root{display:flex;flex-direction:column;padding:0 2px 28px;color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5}',
      '.dsh-oi-head{display:flex;flex-direction:column;gap:10px;padding-bottom:16px;border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.dsh-oi-head-text{display:flex;flex-direction:column;gap:4px;min-width:0}',
      '.dsh-oi-h1{font-size:17px;font-weight:650;margin:0;letter-spacing:-.01em}',
      '.dsh-oi-sub{margin:0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1.45}',
      '.dsh-oi-sec{display:flex;flex-direction:column;gap:10px;padding:20px 0;border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.dsh-oi-sec:last-child{border-bottom:0;padding-bottom:4px}',
      // The save action sits at the very bottom of the page, under everything it
      // commits, instead of floating at the top where it reads as a header.
      '.dsh-oi-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding-top:18px;border-top:1px solid var(--dsw-alias-border-l1)}',
      '.dsh-oi-foot-text{min-width:0;flex:1 1 240px}',
      '.dsh-oi-sec-head{display:flex;flex-direction:column;gap:3px}',
      '.dsh-oi-h2{font-size:14px;font-weight:600;margin:0}',
      '.dsh-oi-sec-desc{margin:0;color:var(--dsw-alias-label-secondary);font-size:12.5px;line-height:1.45}',
      '.dsh-oi-card{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);padding:16px;display:flex;flex-direction:column;gap:14px}',
      '.dsh-oi-form{display:flex;flex-direction:column;gap:14px}',
      '.dsh-oi-field{display:flex;flex-direction:column;gap:6px;min-width:0}',
      '.dsh-oi-label{display:flex;align-items:baseline;justify-content:space-between;gap:10px;font-size:12.5px;font-weight:550;color:var(--dsw-alias-label-primary)}',
      '.dsh-oi-label-note{font-size:12px;font-weight:400;color:var(--dsw-alias-label-secondary)}',
      '.dsh-oi-input{width:100%;height:34px;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);padding:7px 10px;font-size:13px;font-family:inherit;outline:none;line-height:1.35}',
      '.dsh-oi-input:focus{border-color:var(--dsw-alias-brand-primary)}',
      '.dsh-oi-hint{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.45}',
      '.dsh-oi-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}',
      '.dsh-oi-btn{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-radius:999px;padding:6px 14px;font-size:12.5px;font-family:inherit;cursor:pointer}',
      '.dsh-oi-btn:hover:not([disabled]){border-color:var(--dsw-alias-brand-primary)}',
      '.dsh-oi-btn[disabled]{opacity:.5;cursor:not-allowed}',
      '.dsh-oi-btn-primary{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:#fff;font-weight:600}',
      '.dsh-oi-status{font-size:12px;white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-secondary)}',
      '.dsh-oi-error{color:var(--dsw-alias-state-error-primary)}',
      '.dsh-oi-ok{color:var(--dsw-alias-state-success-primary)}',
      '.dsh-oi-spin{display:inline-block;width:11px;height:11px;border:2px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-alias-brand-primary);border-radius:50%;animation:dsh-oi-spin .8s linear infinite;vertical-align:-1px;margin-right:6px}',
      '@keyframes dsh-oi-spin{to{transform:rotate(360deg)}}',
      // The shipped dock entries constrain themselves with the product's own
      // layout variables instead of guessing an offset: two dock insets inside
      // the composer card's max width, centred. Hard-coding the ~96px this was
      // off by would break the moment the window or the chat column changes.
      '.dsh-oi-dock{display:flex;flex-direction:column;gap:7px;width:100%;max-width:calc(var(--dsh-composer-card-max-width, 900px) - var(--dsh-composer-dock-inset, 8px) - var(--dsh-composer-dock-inset, 8px));min-width:0;box-sizing:border-box;margin-inline:auto;overflow-x:auto;padding:7px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-alias-bg-layer-1);font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-oi-dock-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;min-width:0}',
      '.dsh-oi-dock-title{font-weight:600;color:var(--dsw-alias-label-primary);margin-right:2px;flex:0 0 auto}',
      '.dsh-oi-dock label{display:inline-flex;align-items:center;gap:4px;flex:0 0 auto;min-width:0;white-space:nowrap}',
      '.dsh-oi-dock select{max-width:100%;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:11px;font-family:inherit;padding:2px 4px}',
      '.dsh-oi-dock input{border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:11px;font-family:inherit;padding:3px 6px;min-width:0;outline:none}',
      '.dsh-oi-dock input:focus{border-color:var(--dsw-alias-brand-primary)}',
      // The seed is the strip's only editable field, so it carries its own
      // "随机" escape hatch rather than a second row of controls.
      '.dsh-oi-dock-seedbox{display:inline-flex;align-items:center;gap:5px;flex:0 0 auto;min-width:0;white-space:nowrap}',
      '.dsh-oi-dock-seed{width:78px}',
      '.dsh-oi-dock-btn{flex:0 0 auto;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-secondary);border-radius:6px;font-size:11px;font-family:inherit;padding:2px 8px;cursor:pointer}',
      '.dsh-oi-dock-btn:hover{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}',
      '.dsh-oi-dock-refs{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}',
      '.dsh-oi-dock-ref{width:30px;height:30px;border-radius:6px;overflow:hidden;border:1px solid var(--dsw-alias-border-l1);flex:0 0 auto;padding:0;background:transparent;font:inherit;line-height:0}',
      'button.dsh-oi-dock-ref{cursor:pointer}',
      'button.dsh-oi-dock-ref:hover{border-color:var(--dsw-alias-state-error-primary)}',
      '.dsh-oi-dock-ref img{width:100%;height:100%;object-fit:cover;display:block}',
      '.dsh-oi-dock-note{color:var(--dsw-alias-label-secondary);min-width:0}',
      '.dsh-oi-dock-error{color:var(--dsw-alias-state-error-primary);min-width:0}',
      '.dsh-oi-toggle{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-secondary);border-radius:999px;padding:4px 11px 4px 9px;font-size:12px;line-height:1;font-family:inherit;cursor:pointer;white-space:nowrap;transition:background .15s ease,color .15s ease,border-color .15s ease}',
      '.dsh-oi-toggle:hover{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary)}',
      '.dsh-oi-toggle:active{transform:translateY(1px)}',
      '.dsh-oi-toggle-icon{display:inline-flex;align-items:center;justify-content:center}',
      '.dsh-oi-toggle-on{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);font-weight:600}',
      // The conversation card. Registered into `tool.call.toolview` for this
      // plugin's own tool name, so a settled call renders its images at a size
      // worth looking at instead of the generic row's flattened text.
      '.dsh-oi-shot-card{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);overflow:hidden;margin:2px 0}',
      '.dsh-oi-shot-head{display:flex;align-items:center;gap:8px;padding:10px 12px;font-size:12.5px;color:var(--dsw-alias-label-primary)}',
      '.dsh-oi-shot-icon{display:inline-flex;align-items:center;color:var(--dsw-alias-label-secondary)}',
      '.dsh-oi-shot-title{font-weight:600}',
      '.dsh-oi-shot-state{margin-left:auto;color:var(--dsw-alias-label-secondary);font-size:12px}',
      '.dsh-oi-shot-body{display:flex;flex-direction:column;gap:10px;padding:0 12px 12px}',
      '.dsh-oi-shot-text{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.5;white-space:pre-wrap;word-break:break-word}',
      '.dsh-oi-shot-prompt{margin:0;font-size:12.5px;color:var(--dsw-alias-label-primary);opacity:.85;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}',
      '.dsh-oi-shot-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(190px,1fr))}',
      '.dsh-oi-shot-grid[data-single="1"]{grid-template-columns:minmax(0,420px)}',
      '.dsh-oi-shot{position:relative;margin:0;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;overflow:hidden;background:var(--dsw-alias-bg-base)}',
      '.dsh-oi-shot img{display:block;width:100%;height:auto}',
      '.dsh-oi-shot-open{display:block;width:100%;padding:0;border:0;background:transparent;cursor:zoom-in;line-height:0;font:inherit}',
      '.dsh-oi-shot-open:hover img{opacity:.92}',
      '.dsh-oi-shot-wait{aspect-ratio:1/1;background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-oi-shot-cap{padding:6px 8px;border-top:1px solid var(--dsw-alias-border-l1);font-size:11px;color:var(--dsw-alias-label-secondary);word-break:break-all;white-space:pre-wrap}',
      // The footer is the answer to "where did it go": the folder, a button that
      // opens it in the OS, and a copy fallback for a host with no app catalog.
      '.dsh-oi-shot-foot{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 12px;border-top:1px solid var(--dsw-alias-border-l1);font-size:11.5px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-oi-shot-path{min-width:0;flex:1 1 160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}',
      '.dsh-oi-seed-chip{flex:0 0 auto;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;padding:2px 9px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}',
      '.dsh-oi-shot-link{flex:0 0 auto;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);border-radius:999px;padding:3px 10px;font-size:11.5px;font-family:inherit;cursor:pointer}',
      '.dsh-oi-shot-link:hover:not([disabled]){border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}',
      '.dsh-oi-shot-link[disabled]{opacity:.55;cursor:default}',
      '.dsh-oi-shot-note{flex:1 1 100%;color:var(--dsw-alias-state-error-primary)}',
    ].join('\n')

    const STYLE_ID = 'dsh-openrouter-imagen/styles'

    /** Insert this plugin's stylesheet once; the returned disposer removes it. */
    function installStyles() {
      if (typeof document === 'undefined') return () => {}
      let element = document.getElementById(STYLE_ID)
      if (element === null) {
        element = document.createElement('style')
        element.id = STYLE_ID
        element.textContent = CSS
        document.head.appendChild(element)
      }
      return () => {
        const found = document.getElementById(STYLE_ID)
        if (found !== null) found.remove()
      }
    }

    const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

    function bytesToBase64(bytes) {
      const parts = []
      const len = bytes.length
      for (let i = 0; i < len; i += 3) {
        const b0 = bytes[i]
        const has1 = i + 1 < len
        const has2 = i + 2 < len
        const b1 = has1 ? bytes[i + 1] : 0
        const b2 = has2 ? bytes[i + 2] : 0
        parts.push(B64.charAt(b0 >> 2))
        parts.push(B64.charAt(((b0 & 3) << 4) | (b1 >> 4)))
        parts.push(has1 ? B64.charAt(((b1 & 15) << 2) | (b2 >> 6)) : '=')
        parts.push(has2 ? B64.charAt(b2 & 63) : '=')
      }
      return parts.join('')
    }

    function refMediaType(type, name) {
      const value = typeof type === 'string' ? type.toLowerCase() : ''
      if (value === 'image/png' || value === 'image/jpeg' || value === 'image/webp' || value === 'image/gif') return value
      const lower = String(name || '').toLowerCase()
      if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
      if (lower.endsWith('.webp')) return 'image/webp'
      if (lower.endsWith('.gif')) return 'image/gif'
      if (lower.endsWith('.png')) return 'image/png'
      return ''
    }

    function fmtBytes(bytes) {
      const value = Number(bytes) || 0
      if (value >= 1048576) return `${(value / 1048576).toFixed(1)} MB`
      if (value >= 1024) return `${Math.round(value / 1024)} KB`
      return `${value} B`
    }

    function errorText(error) {
      if (error === undefined || error === null) return '未知错误'
      if (typeof error === 'string') return error
      return error.message ? String(error.message) : String(error)
    }

    /** One JSON round-trip against this plugin's own route. Business failures arrive as `{ ok: false }`, not as throws. */
    async function api(action, init) {
      const response = await fetch(`${API}/${action}`, init)
      const text = await response.text()
      let parsed = null
      try {
        parsed = JSON.parse(text)
      } catch {
        throw new Error(`接口 ${action} 返回了非 JSON 内容（HTTP ${response.status}）`)
      }
      return parsed ?? { ok: false, error: '空响应' }
    }

    function Studio() {
      const [config, setConfig] = React.useState({})
      const [hasKey, setHasKey] = React.useState(false)
      const [keyDraft, setKeyDraft] = React.useState('')
      const [suggestions, setSuggestions] = React.useState([])
      const [models, setModels] = React.useState([])
      const [loaded, setLoaded] = React.useState(false)
      const [status, setStatus] = React.useState('')
      const [statusKind, setStatusKind] = React.useState('info')
      const [busy, setBusy] = React.useState('')
      const [keyReport, setKeyReport] = React.useState('')

      React.useEffect(() => {
        let alive = true
        api('config')
          .then((res) => {
            if (!alive) return
            if (res.ok) {
              setConfig(res.config ?? {})
              setHasKey(res.hasKey === true)
              if (Array.isArray(res.suggestions)) setSuggestions(res.suggestions.map((id) => ({ id, name: id })))
            } else {
              setStatus(res.error ?? '读取配置失败')
              setStatusKind('error')
            }
            setLoaded(true)
          })
          .catch((error) => {
            if (!alive) return
            setStatus(`读取配置失败：${errorText(error)}`)
            setStatusKind('error')
            setLoaded(true)
          })
        return () => {
          alive = false
        }
      }, [])

      const setField = (key, value) => setConfig((prev) => ({ ...(prev ?? {}), [key]: value }))

      const run = (label, task) => {
        setBusy(label)
        setStatus('')
        setStatusKind('info')
        return Promise.resolve()
          .then(task)
          .catch((error) => {
            setStatus(errorText(error))
            setStatusKind('error')
          })
          .then(() => setBusy(''))
      }

      const onSave = () =>
        run('save', async () => {
          const patch = { ...config }
          if (keyDraft.trim().length > 0) patch.apiKey = keyDraft.trim()
          const res = await api('config', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(patch),
          })
          if (!res.ok) throw new Error(res.error ?? '保存失败')
          setConfig(res.config ?? {})
          setHasKey(res.hasKey === true)
          setKeyDraft('')
          setStatus(`配置已保存。${res.hasKey ? '（API Key 已写入设置文件）' : '（尚未设置 API Key）'}`)
          setStatusKind('ok')
        })

      const onTestKey = () => {
        setKeyReport('')
        return run('key', async () => {
          const res = await api('test')
          if (!res.ok) throw new Error(res.error ?? 'Key 校验失败')
          setKeyReport(String(res.report ?? ''))
          setStatus('Key 有效。')
          setStatusKind('ok')
        })
      }

      const onModels = () =>
        run('models', async () => {
          const res = await api('models')
          if (!res.ok) throw new Error(res.error ?? '拉取模型列表失败')
          const list = Array.isArray(res.models) ? res.models : []
          setModels(list)
          setStatus(`已拉取 ${list.length} 个图像模型（/images/models 是公开接口，不校验 Key），可在「模型 ID」里下拉选择。`)
          setStatusKind('ok')
        })

      const field = (label, control, hint, note) =>
        h(
          'label',
          { className: 'dsh-oi-field', key: label },
          h(
            'span',
            { className: 'dsh-oi-label' },
            h('span', null, label),
            note ? h('span', { className: 'dsh-oi-label-note' }, note) : null,
          ),
          control,
          hint ? h('p', { className: 'dsh-oi-hint' }, hint) : null,
        )

      const textInput = (key, placeholder, type) =>
        h('input', {
          className: 'dsh-oi-input',
          type: type ?? 'text',
          spellCheck: false,
          placeholder,
          value: config[key] === undefined || config[key] === null ? '' : String(config[key]),
          onChange: (event) => setField(key, event.target.value),
        })

      const select = (key, options, labels) =>
        h(
          'select',
          {
            className: 'dsh-oi-input',
            value: config[key] === undefined || config[key] === null ? '' : String(config[key]),
            onChange: (event) => setField(key, event.target.value),
          },
          options.map((option) =>
            h('option', { key: option === '' ? '__empty' : option, value: option }, labels?.[option] ?? (option === '' ? '（默认）' : option)),
          ),
        )

      const enabled = busy === ''
      const statusLine =
        status.length === 0
          ? null
          : h(
              'div',
              { className: `dsh-oi-status ${statusKind === 'error' ? 'dsh-oi-error' : statusKind === 'ok' ? 'dsh-oi-ok' : ''}` },
              busy !== '' && busy !== 'refs' ? h('span', { className: 'dsh-oi-spin' }) : null,
              status,
            )

      /** One titled block; the page is a stack of these instead of one long card. */
      const section = (title, description, children) =>
        h(
          'section',
          { className: 'dsh-oi-sec', key: title },
          h(
            'div',
            { className: 'dsh-oi-sec-head' },
            h('h2', { className: 'dsh-oi-h2' }, title),
            description ? h('p', { className: 'dsh-oi-sec-desc' }, description) : null,
          ),
          children,
        )

      return h(
        'div',
        { className: 'dsh-oi-root' },
        h(
          'div',
          { className: 'dsh-oi-head' },
          h(
            'div',
            { className: 'dsh-oi-head-text' },
            h('h1', { className: 'dsh-oi-h1' }, 'OpenRouter 图像生成'),
            h(
              'p',
              { className: 'dsh-oi-sub' },
              '长期配置都在这一页。分辨率、宽高比、质量、格式、数量、背景、种子和附加请求参数在对话框上方的「图像」面板里，改完立即生效；保存按钮在本页最下方。',
            ),
          ),
        ),

        section(
          '密钥',
          '只写字段：服务端从不回传已保存的 Key，留空表示不修改。',
          h(
            'div',
            { className: 'dsh-oi-card' },
            field(
              'API Key',
              h('input', {
                className: 'dsh-oi-input',
                type: 'password',
                autoComplete: 'off',
                spellCheck: false,
                placeholder: hasKey ? '已保存 · 留空表示不修改' : 'sk-or-v1-...',
                value: keyDraft,
                onChange: (event) => setKeyDraft(event.target.value),
              }),
              '在 openrouter.ai/keys 创建。',
              hasKey ? '已保存' : '未设置',
            ),
            h(
              'div',
              { className: 'dsh-oi-actions' },
              h('button', { className: 'dsh-oi-btn', onClick: onTestKey, disabled: !enabled || !loaded }, busy === 'key' ? '校验中…' : '测试 Key'),
              keyReport.length > 0 ? h('span', { className: 'dsh-oi-hint' }, keyReport) : null,
            ),
          ),
        ),

        section(
          '模型',
          '留空则用配置里的默认模型。',
          h(
            'div',
            { className: 'dsh-oi-card' },
            field(
              '模型 ID',
              h('input', {
                className: 'dsh-oi-input',
                list: 'dsh-oi-model-options',
                spellCheck: false,
                placeholder: 'openai/gpt-image-2.5-sunburst',
                value: config.model === undefined || config.model === null ? '' : String(config.model),
                onChange: (event) => setField('model', event.target.value),
              }),
              '可先点「拉取模型列表」，再从下拉里选。',
            ),
            h(
              'div',
              { className: 'dsh-oi-actions' },
              h('button', { className: 'dsh-oi-btn', onClick: onModels, disabled: !enabled }, busy === 'models' ? '拉取中…' : '拉取模型列表'),
            ),
            h('datalist', { id: 'dsh-oi-model-options' }, (models.length > 0 ? models : suggestions).map((item) =>
              h('option', { key: item.id, value: item.id }, item.name),
            )),
          ),
        ),

        section(
          '请求',
          '只留长期偏好：OpenRouter 怎么挑上游 Provider。逐次调整的参数都在对话框上方的「图像」面板里。',
          h(
            'div',
            { className: 'dsh-oi-card' },
            field('Provider 排序', select('providerSort', SORTS, { '': '不指定', price: 'price（最便宜）', throughput: 'throughput', latency: 'latency' })),
          ),
        ),

        section(
          '输出',
          '生成的文件写到哪里。',
          h(
            'div',
            { className: 'dsh-oi-card' },
            field(
              '保存目录',
              textInput('saveDir', 'generated-images'),
              '相对当前项目文件夹（会话工作目录）；填绝对路径就照用；留空表示只存进 DSH 附件库。',
            ),
          ),
        ),

        h(
          'div',
          { className: 'dsh-oi-foot' },
          h(
            'div',
            { className: 'dsh-oi-foot-text' },
            statusLine ?? h('p', { className: 'dsh-oi-hint' }, '改完记得保存：只有这页的字段需要手动提交，上面「图像」面板里的改动是即时生效的。'),
          ),
          h(
            'button',
            { className: 'dsh-oi-btn dsh-oi-btn-primary', onClick: onSave, disabled: !enabled || !loaded },
            busy === 'save' ? '保存中…' : loaded ? '保存配置' : '加载中…',
          ),
        ),
      )
    }

    /** The knobs that belong next to the prompt rather than buried in Settings. */
    const DOCK_PARAMS = [
      ['分辨率', 'resolution', RESOLUTIONS],
      ['宽高比', 'aspectRatio', ASPECTS],
      ['质量', 'quality', QUALITIES],
      ['格式', 'outputFormat', FORMATS],
      ['数量', 'count', ['1', '2', '3', '4']],
      ['背景', 'background', BACKGROUNDS],
    ]

    /** Previews of what THIS page has staged; the Host owns the authoritative list. */
    const stagedPreviews = []
    const stageSubscribers = new Set()
    const notifyStaged = () => {
      for (const listener of Array.from(stageSubscribers)) {
        try {
          listener()
        } catch {
          /* one bad subscriber must not break the others */
        }
      }
    }

    /**
     * The seed of the most recent generation, handed from the conversation card
     * to the composer strip.
     *
     * The card is the only place a settled result exists, and the *next* call
     * starts from the strip, so the two halves have to meet somewhere. The strip
     * shows the value AND persists it: the Host reads the seed from settings, so
     * a number that merely sat in the input box would be ignored.
     */
    const seedListeners = new Set()
    function notifySeed(value) {
      for (const listener of Array.from(seedListeners)) {
        try {
          listener(value)
        } catch {
          /* one bad subscriber must not break the others */
        }
      }
    }

    /** Read image files into base64 and stage them on the Host for the next generation. */
    async function stageImageFiles(files) {
      const images = []
      for (const file of Array.from(files ?? [])) {
        const mediaType = refMediaType(file?.type, file?.name)
        if (mediaType === '') continue
        const bytes = new Uint8Array(await file.arrayBuffer())
        if (bytes.length === 0 || bytes.length > MAX_REF_BYTES) continue
        images.push({ mediaType, data: bytesToBase64(bytes), name: String(file?.name ?? 'pasted') })
      }
      if (images.length === 0) return 0
      const res = await api('reference', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ references: images.map((image) => ({ mediaType: image.mediaType, data: image.data })) }),
      })
      if (!res.ok) throw new Error(res.error ?? '暂存参考图失败')
      for (const image of images) {
        stagedPreviews.push(image)
        while (stagedPreviews.length > MAX_REFS) stagedPreviews.shift()
      }
      notifyStaged()
      return images.length
    }

    /**
     * Composer strip, registered above the input box.
     *
     * Editing a knob writes the SAME settings namespace the model tool reads,
     * so what is chosen here is what the next generation uses — including one
     * the model runs on its own. The reference image is staged on the Host and
     * consumed by the next successful generation.
     */
    /**
     * Whether the parameter strip is expanded. Collapsed by default — the
     * strip is opt-in, so an idle composer stays exactly as it was.
     */
    let dockVisible = false
    const dockListeners = new Set()
    const notifyDock = () => {
      for (const listener of Array.from(dockListeners)) {
        try {
          listener()
        } catch {
          /* one bad subscriber must not break the others */
        }
      }
    }

    /**
     * The composer-row button that reveals the strip. Registered in
     * `conversation.input.right`, immediately after the shipped 识图 toggle.
     */
    function DockToggle() {
      const [, bump] = React.useState(0)
      React.useEffect(() => {
        const rerender = () => bump((n) => n + 1)
        dockListeners.add(rerender)
        return () => {
          dockListeners.delete(rerender)
        }
      }, [])
      return h(
        'button',
        {
          type: 'button',
          className: dockVisible ? 'dsh-oi-toggle dsh-oi-toggle-on' : 'dsh-oi-toggle',
          title: dockVisible ? '隐藏图像生成参数' : '显示图像生成参数',
          'aria-pressed': dockVisible,
          onClick: () => {
            dockVisible = !dockVisible
            notifyDock()
          },
        },
        h('span', { className: 'dsh-oi-toggle-icon', 'aria-hidden': 'true' }, imageGlyph(14)),
        h('span', null, '图像'),
      )
    }

    function ComposerDock() {
      const [config, setConfig] = React.useState({})
      const [stagedCount, setStagedCount] = React.useState(0)
      const [note, setNote] = React.useState('')
      const [error, setError] = React.useState('')
      // The seed box is edited locally and committed on blur or Enter: POSTing on
      // every keystroke would write half-typed numbers.
      const [seedDraft, setSeedDraft] = React.useState('')
      const [, bumpRender] = React.useState(0)

      React.useEffect(() => {
        let alive = true
        api('config')
          .then((res) => {
            if (!alive || !res.ok) return
            const loaded = res.config ?? {}
            setConfig(loaded)
            setSeedDraft(loaded.seed === undefined || loaded.seed === null ? '' : String(loaded.seed))
          })
          .catch(() => {})
        const rerender = () => bumpRender((n) => n + 1)
        // A finished generation reports the seed it drew, and the box takes it
        // over so the picture can be asked for again; 随机 hands it back.
        const applySeed = (value) => {
          const text = String(value ?? '').trim()
          if (text.length === 0) return
          setSeedDraft(text)
          write('seed', text, `已记下本次种子 ${text}，下次生图会沿用它`)
        }
        stageSubscribers.add(rerender)
        dockListeners.add(rerender)
        seedListeners.add(applySeed)
        const poll = setInterval(async () => {
          // Nothing on screen while collapsed, so nothing to refresh.
          if (!dockVisible) return
          try {
            const res = await api('reference')
            if (alive && res.ok) setStagedCount(res.count ?? 0)
          } catch {
            /* a poll failure is not worth a banner */
          }
        }, 4000)
        return () => {
          alive = false
          stageSubscribers.delete(rerender)
          dockListeners.delete(rerender)
          seedListeners.delete(applySeed)
          clearInterval(poll)
        }
      }, [])

      /** `message` replaces the generic 「已保存」 when the write means something else. */
      const write = (key, value, message) => {
        setConfig((prev) => ({ ...(prev ?? {}), [key]: value }))
        api('config', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ [key]: key === 'count' ? Number(value) : value }),
        })
          .then((res) => {
            if (!res.ok) throw new Error(res.error ?? '保存失败')
            setError('')
            setNote(message ?? '已保存')
          })
          .catch((err) => setError(errorText(err)))
      }

      /** Commit the seed box, refusing a value the Host would only reject later. */
      const commit = (key, raw) => {
        const value = String(raw ?? '').trim()
        const current = config[key] === undefined || config[key] === null ? '' : String(config[key])
        if (value === current) return
        if (key === 'seed' && value.length > 0 && !/^-?\d+$/u.test(value)) {
          setError('种子必须是整数，例如 12345；留空表示每次随机')
          return
        }
        setError('')
        write(key, value)
      }

      const commitOnEnter = (key) => (event) => {
        if (event?.key !== 'Enter') return
        if (typeof event.target?.blur === 'function') event.target.blur()
        else commit(key, event?.target?.value)
      }

      const clearReferences = () => {
        api('reference', { method: 'DELETE' })
          .then((res) => {
            if (!res.ok) throw new Error(res.error ?? '清空失败')
            stagedPreviews.length = 0
            setStagedCount(0)
            setError('')
            setNote('已清空参考图')
            notifyStaged()
          })
          .catch((err) => setError(errorText(err)))
      }

      /**
       * Drop ONE staged reference.
       *
       * The Host route replaces the whole staged list, so the survivors are
       * re-uploaded — only possible while this page still holds the bytes of
       * every staged image (`stagedPreviews` covers the Host's count). Images
       * staged before a reload have no bytes here, so those offer 清空 only.
       */
      const removeStaged = (index) => {
        const remaining = stagedPreviews.slice()
        remaining.splice(index, 1)
        api('reference', { method: 'DELETE' })
          .then(async (res) => {
            if (!res.ok) throw new Error(res.error ?? '移除失败')
            if (remaining.length > 0) {
              const posted = await api('reference', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ references: remaining.map((item) => ({ mediaType: item.mediaType, data: item.data })) }),
              })
              if (!posted.ok) throw new Error(posted.error ?? '移除失败')
            }
            stagedPreviews.length = 0
            for (const item of remaining) stagedPreviews.push(item)
            setStagedCount(remaining.length)
            setError('')
            setNote(remaining.length === 0 ? '已移除参考图' : `已移除 1 张，剩 ${remaining.length} 张`)
            notifyStaged()
          })
          .catch((err) => setError(errorText(err)))
      }

      /** Back to "draw a fresh seed for me": the Host does the drawing. */
      const randomizeSeed = () => {
        setSeedDraft('')
        write('seed', '', '下次生成随机取种子')
      }

      // All hooks run before this: collapsing must not change hook order.
      if (!dockVisible) return null

      const total = Math.max(stagedCount, stagedPreviews.length)
      // Every staged image still has its bytes here, so any one of them can be
      // re-uploaded after a removal; otherwise only the whole list can go.
      const removable = stagedPreviews.length > 0 && stagedPreviews.length === total
      return h(
        'div',
        { className: 'dsh-oi-dock' },
        h(
          'div',
          { className: 'dsh-oi-dock-row' },
          h('span', { className: 'dsh-oi-dock-title' }, '图像生成'),
          ...DOCK_PARAMS.map(([label, key, options]) =>
            h(
              'label',
              { key },
              label,
              h(
                'select',
                {
                  value: config[key] === undefined || config[key] === null ? '' : String(config[key]),
                  onChange: (event) => write(key, event.target.value),
                },
                options.map((option) =>
                  h('option', { key: option, value: option }, OPTION_LABELS[option] ?? option),
                ),
              ),
            ),
          ),
          // 种子 rides the same row as the selects, right after 背景. It is the
          // only editable field there, and a finished generation fills it back in
          // with the seed it actually used.
          h(
            'span',
            { key: 'seed', className: 'dsh-oi-dock-seedbox' },
            '种子',
            h('input', {
              className: 'dsh-oi-dock-seed',
              type: 'text',
              inputMode: 'numeric',
              spellCheck: false,
              placeholder: '随机',
              title: '留空 = 每次随机；生成后会自动填入本次用的种子，填同一个数字即可复现',
              value: seedDraft,
              onChange: (event) => setSeedDraft(event.target.value),
              onBlur: (event) => commit('seed', event.target.value),
              onKeyDown: commitOnEnter('seed'),
            }),
            h(
              'button',
              { type: 'button', className: 'dsh-oi-dock-btn', title: '清空种子，下一次生成由插件随机取一个', onClick: randomizeSeed },
              '随机',
            ),
          ),
          h(
            'span',
            { className: 'dsh-oi-dock-refs' },
            total > 0 ? h('span', { className: 'dsh-oi-dock-note' }, '参考图') : null,
            stagedPreviews.slice(-MAX_REFS).map((item, index) =>
              removable
                ? h(
                    'button',
                    {
                      type: 'button',
                      className: 'dsh-oi-dock-ref',
                      key: `${index}-${item.name}`,
                      title: `点击移除「${item.name}」`,
                      onClick: () => removeStaged(index),
                    },
                    h('img', { src: `data:${item.mediaType};base64,${item.data}`, alt: item.name }),
                  )
                : h('span', { className: 'dsh-oi-dock-ref', key: `${index}-${item.name}`, title: item.name }, h('img', { src: `data:${item.mediaType};base64,${item.data}`, alt: item.name })),
            ),
            total > 0
              ? h('button', { className: 'dsh-oi-dock-btn', onClick: clearReferences }, `清空参考图 ×${total}`)
              : null,
          ),
          h('span', { className: error.length > 0 ? 'dsh-oi-dock-error' : 'dsh-oi-dock-note' }, error.length > 0 ? error : note.length > 0 ? note : total > 0 ? '已暂存，下一次生成会带上（不随消息发送）' : ''),
        ),
      )
    }

    /* ---- the conversation card for this plugin's own tool ---- */

    /** The image/picture glyph shared by the composer toggle and the tool card. */
    function imageGlyph(size) {
      return h(
        'svg',
        { width: size ?? 14, height: size ?? 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' },
        h('rect', { x: 3, y: 3, width: 18, height: 18, rx: 4.5 }),
        h('circle', { cx: 9, cy: 9.5, r: 1.5 }),
        h('path', { d: 'M21 15.4l-4.6-4.6L7 20.4' }),
      )
    }

    /* ---- opening the folder a picture landed in ---- */

    /**
     * The host's own directory-app catalog (`dsh-host-open-in-app`) — the same
     * primitive behind the session header's "Open In..." button. The card knows
     * a *directory*, and this route is the shipped way to hand one to the
     * operating system instead of making the user retype a hash-named path.
     *
     * Availability is read once per page (a host cannot install an app
     * mid-session), and a composition without the catalog degrades to the copy
     * button rather than to a dead control.
     */
    const OPEN_IN_APP_APPS = '/open-in-app/apps'
    const OPEN_IN_APP_OPEN = '/open-in-app/open'
    /** Used when nothing usable is remembered; a file manager beats an editor. */
    const OPEN_APP_PREFERENCE = ['explorer', 'filemanager', 'finder', 'vscode', 'cursor']
    let appsPromise = null

    function availableApps() {
      appsPromise ??= fetch(OPEN_IN_APP_APPS, { headers: { accept: 'application/json' } })
        .then((response) => (response.ok ? response.json() : null))
        .then((payload) => (Array.isArray(payload?.apps) ? payload.apps.filter((id) => typeof id === 'string') : []))
        .catch(() => [])
      return appsPromise
    }

    /** The app the shipped split button remembers (`dsh.open-in-app.choice`), when it still exists. */
    function rememberedApp(apps) {
      let stored = ''
      try {
        const raw = localStorage.getItem('dsh.open-in-app.choice')
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : null
        if (typeof parsed === 'string') stored = parsed
      } catch {
        /* blocked or private-mode storage simply means "nothing remembered" */
      }
      if (stored.length > 0 && apps.includes(stored)) return stored
      for (const candidate of OPEN_APP_PREFERENCE) if (apps.includes(candidate)) return candidate
      return apps[0] ?? ''
    }

    /** Hand one absolute directory to the OS. Throws with the host's own message on refusal. */
    async function openFolderInApp(path) {
      const apps = await availableApps()
      const app = rememberedApp(apps)
      if (app === '') throw new Error('这台主机没有可用的目录应用，请手动打开')
      const response = await fetch(OPEN_IN_APP_OPEN, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ app, path }),
      })
      if (response.ok) return app
      let detail = `HTTP ${response.status}`
      try {
        const payload = await response.json()
        if (typeof payload?.message === 'string' && payload.message.length > 0) detail = payload.message
      } catch {
        /* a non-JSON error body is not worth a second failure */
      }
      throw new Error(detail)
    }

    /** Clipboard with an explicit failure: a silent no-op would read as success. */
    async function copyText(text) {
      if (typeof navigator === 'undefined' || navigator.clipboard === undefined) throw new Error('浏览器不允许复制，请手动选取路径')
      await navigator.clipboard.writeText(text)
    }

    /**
     * One durable image of a settled call.
     *
     * The bytes are authorized per Session by the chat node and handed down as
     * `loadImage`, which resolves to a displayable URL — a package must never
     * reach for the attachment store itself.
     */
    function ToolImage(props) {
      const [url, setUrl] = React.useState(null)
      React.useEffect(() => {
        let alive = true
        setUrl(null)
        const load = props.loadImage
        if (typeof load !== 'function' || props.attachment === null || props.attachment === undefined) return () => { alive = false }
        load(props.attachment).then(
          (resolved) => {
            if (alive) setUrl(typeof resolved === 'string' && resolved.length > 0 ? resolved : null)
          },
          () => {},
        )
        return () => {
          alive = false
        }
      }, [props.attachment, props.loadImage])
      if (url === null) return h('div', { className: 'dsh-oi-shot-wait', 'aria-hidden': 'true' })
      return h('img', { src: url, alt: props.label ?? '生成的图片' })
    }

    /**
     * `tool.call.toolview` cell for `openrouter_generate_image`.
     *
     * A tool with no cell of its own falls back to the generic row, which
     * flattens the result — image blocks included — to text, so the picture the
     * user just paid for never appears. This cell renders the same content at a
     * size worth looking at, and keeps working while the call is still running.
     */
    function GeneratedImagesCard(props) {
      const block = props.block
      const running = block === null || block === undefined || !('kind' in block)
      const call = running ? block : block.call
      let args = null
      try {
        args = JSON.parse(String(call?.argsRaw ?? ''))
      } catch {
        args = null
      }
      const content = running || !Array.isArray(block.content) ? [] : block.content
      const refs = []
      const texts = []
      for (const part of content) {
        if (part === null || typeof part !== 'object') continue
        if (part.type === 'text' && typeof part.text === 'string') {
          texts.push(part.text)
          continue
        }
        if (part.type !== 'image') continue
        const attachment = part.attachment
        if (attachment === null || typeof attachment !== 'object') continue
        if (typeof attachment.attachmentId !== 'string' || attachment.attachmentId.length === 0) continue
        refs.push(attachment)
      }
      const joined = texts.join('\n').trim()
      const failure = running ? '' : block.isError === true ? joined : ''
      // The Host renders the save location as its own line and every file path
      // after `文件：`, so the card can offer the folder without guessing at any
      // undocumented field of the settled block.
      const dirMatch = /(?:^|\n)保存目录：(.+)/u.exec(joined)
      const savedDir = dirMatch === null ? '' : dirMatch[1].trim()
      // The sidebar resolves a file address against the session workspace, and
      // `dsh-util-workspace-path` can only turn a relative path into an absolute
      // one when it knows the workspace root. Handing it a bare relative value
      // therefore lands on the folder/browse fallback instead of the picture, so
      // every path this card opens is made absolute here, against the view's own
      // cwd first and the save folder second.
      const root = typeof props.cwd === 'string' && props.cwd.length > 0 ? props.cwd : savedDir
      const absolutize = (value) => {
        const text = String(value ?? '')
        if (text.length === 0) return ''
        if (text.startsWith('/') || text.startsWith('\\\\') || /^[A-Za-z]:[\\/]/u.test(text)) return text
        if (root.length === 0) return text
        const separator = /^[A-Za-z]:\\/u.test(root) || root.startsWith('\\\\') ? '\\' : '/'
        return `${root.replace(/[\\/]+$/u, '')}${separator}${text.replace(/^[\\/]+/u, '')}`
      }
      /**
       * Keep an in-workspace path in its full absolute spelling.
       *
       * `dsh-client-ui-chat` rewrites a path inside the Session workspace into a
       * *workspace-relative* file address (`fileAddressFor`), and on this build
       * the sidebar cannot read that form back: it shows `/generated-images/…`
       * and falls back to the folder body, while the very same file handed over
       * as `X:/github/…/out.png` opens fine. The rewrite is a case-sensitive
       * `startsWith` against the workspace root, and Windows paths are not
       * case-sensitive, so lower-casing the drive letter keeps the absolute form
       * without changing which file is read. Reported paths in the card and in
       * the tool result stay in their normal spelling — only the opener sees this.
       *
       * This card's own thumbnails are the one surface it can repair by itself;
       * the chat's path links and the 交付文件 card's 打开 button are repaired at
       * the Sidebar seam instead (see `absolutizeFileAddress` below). Both are
       * kept: this one also covers a build where that seam is unavailable.
       */
      const keepAbsolute = (value) => {
        const text = String(value ?? '')
        if (text.length === 0 || root.length === 0) return text
        const normalizedRoot = root.replace(/\\/g, '/').replace(/\/+$/u, '')
        const normalized = text.replace(/\\/g, '/')
        if (!normalized.startsWith(`${normalizedRoot}/`)) return text
        return /^[A-Za-z]:/u.test(text) ? text[0].toLowerCase() + text.slice(1) : text
      }
      const filesMatch = /(?:^|\n)文件：([\s\S]*)$/u.exec(joined)
      const files =
        filesMatch === null
          ? []
          : filesMatch[1]
              .split('\n')
              .map((line) => line.trim())
              .filter((line) => line.length > 0)
      // The Host prints the seed it used on a line of its own, ahead of `文件：`;
      // that line is what lets this card hand the composer strip a value worth
      // reusing on the next call.
      const seedMatch = /(?:^|\n)种子：(-?\d+)(（本次随机）)?/u.exec(joined)
      const usedSeed = seedMatch === null ? '' : seedMatch[1]
      const seedWasRandom = seedMatch !== null && seedMatch[2] !== undefined
      const summary =
        failure.length > 0
          ? ''
          : joined
              .replace(/\n?保存目录：[\s\S]*$/u, '')
              .replace(/\n?种子：[^\n]*/u, '')
              .replace(/\n?文件：[\s\S]*$/u, '')
              .trim()
      const prompt = typeof args?.prompt === 'string' ? args.prompt.trim() : ''
      const state = running
        ? h('span', null, h('span', { className: 'dsh-oi-spin' }), '生成中…')
        : failure.length > 0
          ? '失败'
          : refs.length > 0
            ? `${refs.length} 张`
            : '无图片'

      const [linkNote, setLinkNote] = React.useState('')
      const [copied, setCopied] = React.useState(false)
      // A settled call tells the composer strip which seed produced the picture;
      // the strip persists it, because the Host reads the seed from settings.
      React.useEffect(() => {
        if (usedSeed.length > 0) notifySeed(usedSeed)
      }, [usedSeed])
      const openFolder = () => {
        if (savedDir.length === 0) return
        setLinkNote('正在打开…')
        openFolderInApp(savedDir).then(
          (app) => setLinkNote(app === 'explorer' || app === 'finder' || app === 'filemanager' ? '' : `已在 ${app} 中打开`),
          (error) => setLinkNote(`打开失败：${errorText(error)}（可用「复制路径」）`),
        )
      }
      const copyPath = () => {
        if (savedDir.length === 0) return
        copyText(savedDir).then(
          () => {
            setCopied(true)
            setLinkNote('')
          },
          (error) => setLinkNote(errorText(error)),
        )
      }
      const openImage = (path) => {
        if (typeof props.openFile !== 'function') return
        const target = keepAbsolute(absolutize(path))
        if (target.length === 0) return
        try {
          props.openFile(target)
        } catch {
          /* a view without a file opener must not break the card */
        }
      }

      return h(
        'div',
        { className: 'dsh-oi-shot-card' },
        h(
          'div',
          { className: 'dsh-oi-shot-head' },
          h('span', { className: 'dsh-oi-shot-icon', 'aria-hidden': 'true' }, imageGlyph(14)),
          h('span', { className: 'dsh-oi-shot-title' }, '图像生成'),
          h('span', { className: 'dsh-oi-shot-state' }, state),
        ),
        h(
          'div',
          { className: 'dsh-oi-shot-body' },
          prompt.length > 0 ? h('p', { className: 'dsh-oi-shot-prompt', title: prompt }, prompt) : null,
          summary.length > 0 ? h('p', { className: 'dsh-oi-shot-text' }, summary) : null,
          failure.length > 0 ? h('p', { className: 'dsh-oi-shot-text dsh-oi-error' }, failure) : null,
          refs.length > 0
            ? h(
                'div',
                { className: 'dsh-oi-shot-grid', 'data-single': refs.length === 1 ? '1' : undefined },
                refs.map((attachment, index) => {
                  const path = files[index] ?? ''
                  const image = h(ToolImage, { attachment, loadImage: props.loadImage, label: attachment.name ?? `图片 ${index + 1}` })
                  return h(
                    'figure',
                    { className: 'dsh-oi-shot', key: `${attachment.attachmentId}:${index}` },
                    typeof props.openFile === 'function' && path.length > 0
                      ? h('button', { type: 'button', className: 'dsh-oi-shot-open', title: `在侧栏打开 ${path}`, onClick: () => openImage(path) }, image)
                      : image,
                    h(
                      'figcaption',
                      { className: 'dsh-oi-shot-cap' },
                      `${attachment.width}×${attachment.height} · ${fmtBytes(attachment.bytes)}` +
                        (attachment.name ? ` · ${attachment.name}` : ''),
                    ),
                  )
                }),
              )
            : null,
        ),
        savedDir.length > 0 || usedSeed.length > 0
          ? h(
              'div',
              { className: 'dsh-oi-shot-foot' },
              savedDir.length > 0 ? h('span', { className: 'dsh-oi-shot-path', title: savedDir }, savedDir) : null,
              savedDir.length > 0
                ? h('button', { type: 'button', className: 'dsh-oi-shot-link', onClick: openFolder }, '打开文件夹')
                : null,
              savedDir.length > 0
                ? h('button', { type: 'button', className: 'dsh-oi-shot-link', onClick: copyPath, disabled: copied }, copied ? '已复制' : '复制路径')
                : null,
              usedSeed.length > 0
                ? h(
                    'span',
                    { className: 'dsh-oi-seed-chip', title: '下一次生成会沿用这个种子；面板里的「随机」可以换掉' },
                    `种子 ${usedSeed}${seedWasRandom ? '（随机）' : ''}`,
                  )
                : null,
              linkNote.length > 0 ? h('span', { className: 'dsh-oi-shot-note' }, linkNote) : null,
            )
          : null,
      )
    }

    /**
     * Sidebar file addresses: put the absolute path back.
     *
     * Every surface that opens a file in the right sidebar — the chat's own path
     * links, and the 交付文件 card's 打开 button alike — goes through
     * `dsh-client-ui-chat`'s `openFile`, and that helper runs the path through
     * `dsh-util-workspace-path`'s `fileAddressFor`. An absolute path INSIDE the
     * Session workspace is rewritten there into a workspace-*relative* file
     * address, so `X:\github\…\generated-images\out.png` reaches the sidebar as
     * `dsh-resource://file/session/<id>/generated-images/out.png`. On this build
     * the sidebar cannot read that form back — the tab lands on the folder body
     * instead of the picture — while the very same file handed over with its
     * absolute path opens correctly. The tell is visible in the UI: the card's
     * hover tooltip shows `X:\github\…\out.png` and the opened tab shows
     * `/generated-images/out.png`.
     *
     * The rewrite is a case-sensitive `startsWith` against the workspace root,
     * but Windows paths are not case-sensitive, so a lower-cased drive letter
     * also defeats it (that is what this card does for its own thumbnails). A
     * card cannot help the chat's path links or the 交付文件 button, though, so
     * the repair belongs one seam further down: the address is put back into its
     * absolute spelling immediately before `ctx.sidebarRight.openResource`, which
     * is the single door every one of those callers uses.
     *
     * `cwdOf(sessionId)` supplies the Session workspace root the relative path is
     * relative to. When it is unknown the address is passed through untouched, so
     * an unknown Session keeps today's behaviour instead of gaining a wrong path.
     */
    const FILE_ADDRESS_PREFIX = 'dsh-resource://file/'
    const SESSION_FILE_PREFIX = `${FILE_ADDRESS_PREFIX}session/`

    /** Component-encode one address segment, keeping `:` literal for drive letters. */
    function encodeAddressSegment(segment) {
      return encodeURIComponent(segment).replace(/%3A/giu, ':')
    }

    /** Whether a path is absolute in either spelling the Host accepts. */
    function isAbsolutePathText(value) {
      return value.startsWith('/') || value.startsWith('\\\\') || /^[A-Za-z]:[\\/]/u.test(value)
    }

    /**
     * Rewrite a session file address so its path segment carries the absolute
     * spelling instead of a workspace-relative one; every other address, and one
     * whose Session workspace root is unknown, is returned unchanged.
     */
    function absolutizeFileAddress(address, cwdOf) {
      if (typeof address !== 'string' || !address.startsWith(SESSION_FILE_PREFIX)) return address
      const rest = address.slice(SESSION_FILE_PREFIX.length)
      const cut = rest.indexOf('/')
      if (cut <= 0) return address
      const idSegment = rest.slice(0, cut)
      const encodedPath = rest.slice(cut + 1)
      if (encodedPath.length === 0) return address
      let path = ''
      let sessionId = ''
      try {
        path = encodedPath.split('/').map(decodeURIComponent).join('/')
        sessionId = decodeURIComponent(idSegment)
      } catch {
        return address
      }
      if (path.length === 0 || isAbsolutePathText(path)) return address
      const cwd = typeof cwdOf === 'function' ? cwdOf(sessionId) : undefined
      if (typeof cwd !== 'string' || cwd.length === 0) return address
      const separator = /^[A-Za-z]:\\/u.test(cwd) || cwd.startsWith('\\\\') ? '\\' : '/'
      const joined = `${cwd.replace(/[\\/]+$/u, '')}${separator}${path.replace(/^[\\/]+/u, '')}`
      const segments = joined.replace(/\\/g, '/').split('/').map(encodeAddressSegment)
      return `${SESSION_FILE_PREFIX}${idSegment}/${segments.join('/')}`
    }

    /**
     * Replace one method with a wrapper, or return `undefined` when the method is
     * absent or the write is refused (a frozen object or a read-only property).
     * The returned callback restores the original only if the wrapper is still
     * the live method.
     */
    function patchMethod(target, name, wrapperOf) {
      const original = target[name]
      if (typeof original !== 'function') return undefined
      const wrapper = wrapperOf(original)
      try {
        target[name] = wrapper
      } catch {
        return undefined
      }
      if (target[name] !== wrapper) return undefined
      return () => {
        if (target[name] === wrapper) target[name] = original
      }
    }

    /**
     * Install the address repair on the right-Sidebar face.
     * @returns the disposer that restores every patched method.
     */
    function installSidebarAbsolutePaths(scope, cwdOf) {
      const sidebar = scope.get('sidebarRight')
      if (sidebar === undefined || sidebar === null) return () => {}
      const undoResource = patchMethod(
        sidebar,
        'openResource',
        (original) =>
          function (address, options) {
            return original.call(this, absolutizeFileAddress(address, cwdOf), options)
          },
      )
      const undoIn = patchMethod(
        sidebar,
        'openResourceIn',
        (original) =>
          function (sessionId, address, options) {
            const cwd = cwdOf(sessionId)
            return original.call(this, sessionId, absolutizeFileAddress(address, () => cwd), options)
          },
      )
      return () => {
        if (undoIn !== undefined) undoIn()
        if (undoResource !== undefined) undoResource()
      }
    }

    /**
     * Register the settings page. The section id is this plugin's own, so the
     * page sits beside the shipped sections instead of replacing one.
     */
    function apply(ctx) {
      ctx.effect(installStyles, 'openrouter-image: styles')
      ctx.effect(
        () =>
          ctx.slots.inject('settings.section', function* () {
            yield ctx.slots.register(
              { name: 'settings.section', id: 'openrouter-image', order: 260, label: '图像生成' },
              Studio,
            )
          }),
        'openrouter-image: settings section',
      )
      ctx.effect(
        () =>
          ctx.slots.inject('conversation.input.dock', function* () {
            yield ctx.slots.register({ name: 'conversation.input.dock', id: 'openrouter-image', order: 30 }, ComposerDock)
          }),
        'openrouter-image: composer strip',
      )
      // Sits immediately after the shipped 识图 toggle (order 40) in the same
      // composer row, and reveals the strip above.
      ctx.effect(
        () =>
          ctx.slots.inject('conversation.input.right', function* () {
            yield ctx.slots.register({ name: 'conversation.input.right', id: 'openrouter-image-toggle', order: 41 }, DockToggle)
          }),
        'openrouter-image: composer toggle',
      )
      // A call of this plugin's OWN tool gets a card of its own. Without this
      // cell the generic Tool row flattens the settled result — image blocks
      // included — into text, which is why the picture never showed up.
      ctx.effect(
        () =>
          ctx.slots.inject('tool.call.toolview', function* () {
            yield ctx.slots.register(
              { name: 'tool.call.toolview', key: 'openrouter_generate_image' },
              GeneratedImagesCard,
            )
          }),
        'openrouter-image: tool card',
      )
      // Paste anywhere on the page — the composer included — stages the image
      // as the next generation's reference image, and never as a draft message
      // attachment.
      //
      // The reference path never needs the chat model to see the image: the
      // Host posts it straight to OpenRouter. A draft attachment, by contrast,
      // is validated against the chat model's input modalities, and a text-only
      // model then refuses to send the message at all ("当前模型不支持图片").
      // Claiming the paste keeps a text-only model usable; the strip opens
      // itself so the image that was just staged is visible and removable. For
      // a real message attachment, use the composer's own attach control.
      ctx.effect(() => {
        if (typeof document === 'undefined') return () => {}
        const onPaste = (event) => {
          const files = event?.clipboardData?.files
          if (!files || files.length === 0) return
          const images = Array.from(files).filter((file) => refMediaType(file?.type, file?.name) !== '')
          if (images.length === 0) return
          if (typeof event.preventDefault === 'function') event.preventDefault()
          if (!dockVisible) {
            dockVisible = true
            notifyDock()
          }
          void stageImageFiles(images).catch(() => {})
        }
        document.addEventListener('paste', onPaste, true)
        return () => document.removeEventListener('paste', onPaste, true)
      }, 'openrouter-image: reference paste')
      // One seam repairs every caller (see `absolutizeFileAddress` above): this
      // plugin's own card hands over an absolute spelling already, but the chat's
      // path links and the 交付文件 card's 打开 button reach the sidebar as a
      // workspace-relative address, which this build cannot read back. Both go
      // through `ctx.sidebarRight.openResource`, so that is where the path is put
      // back — outside this plugin's own surfaces, and undone again on stop.
      const cwdLookupOf = (scope) => (sessionId) => {
        try {
          const sessions = scope.get('sessions')
          const byId = sessions?.list?.getSnapshot?.()?.byId
          const cwd = byId === undefined ? undefined : byId[sessionId]?.cwd
          if (typeof cwd === 'string' && cwd.length > 0) return cwd
          const header = sessions?.get?.(sessionId)?.header?.cwd
          return typeof header === 'string' && header.length > 0 ? header : undefined
        } catch {
          return undefined
        }
      }
      const installSidebarRepair = (scope) =>
        scope.effect(
          () => installSidebarAbsolutePaths(scope, cwdLookupOf(scope)),
          'openrouter-image: absolute sidebar file addresses',
        )
      if (typeof ctx.inject === 'function') ctx.inject(['sidebarRight'], installSidebarRepair)
      else if (typeof ctx.get === 'function' && ctx.get('sidebarRight') !== undefined) installSidebarRepair(ctx)
    }

    exports.apply = apply
    exports.inject = ['slots']
    exports.absolutizeFileAddress = absolutizeFileAddress
    exports.installSidebarAbsolutePaths = installSidebarAbsolutePaths
    exports.Studio = Studio
    exports.ComposerDock = ComposerDock
    exports.DockToggle = DockToggle
    exports.GeneratedImagesCard = GeneratedImagesCard
    exports.ToolImage = ToolImage
    return module.exports
  },
})
