# dsh-openrouter-image

> 仓库:[`fancyui/dsh-openrouter-imagen`](https://github.com/fancyui/dsh-openrouter-imagen) —— 包就在**仓库根目录**,仓库名带 `n`,npm 包名不带。

一个**可安装、常驻**的 DSH 插件:用 OpenRouter 的 Image API 生成图片,配置持久保存,重启后依然有效。

- **Host 半边**:注册 `openrouter-image` 设置命名空间、`openrouter_generate_image` 工具、以及 `/openrouter-image/api/*` 同源 JSON 路由。
- **Client 半边**:注册三个槽位 —— **设置 → 图像生成** 的配置页、输入框上方的参数条(`conversation.input.dock` 加 `conversation.input.right` 的「图像」按钮)、以及本工具在对话里的卡片(`tool.call.toolview`,把生成的图直接画出来)。

## 目录结构

```
.
├── package.json            # main / exports["./client"] / dsh.bundle.patch / dsh.client
├── cordis.patch.yml        # bundle 层:插入 openrouter-image 插件行
├── LICENSE
├── lib/
│   ├── index.js            # Host 半边(Cordis 插件)
│   └── client.js           # Client 半边(window.__ModuleLoader__.load)
├── preflight.mjs           # Host 半边自检
├── preflight-client.mjs    # Client 半边自检
├── preflight-install.mjs   # 安装 / 挂载自检
└── preview-settings.mjs    # 设置页、输入条的离线排版预览
```

发布到 npm 时只带 `files` 白名单里的东西(`lib/`、`cordis.patch.yml`、`README.md`、`LICENSE` + `package.json`),自检脚本留在仓库里、不进 tarball。

`node_modules/` **不进仓库** —— 它是 `package.json` 装出来的产物,`.gitignore` 一并挡掉 `generated-images/`、`preview/`、`*.log` 与本机打出的 `*.tgz`。

## 安装

标准通道是官方 CLI:`dsh plugin` 把余下的参数转发给 **profile 目录里的 pnpm**,依赖落进 `pnpm-lock.yaml`,启动时 launcher 据此把包挂进 bundle 栈。下面以本机 `desktop` profile 为例。

### 让 agent 装

把下面这段发给能执行本地终端的 agent:

```
Install dsh-openrouter-image into my DSH desktop profile using the official npm registry.
Run: dsh plugin --profile desktop add dsh-openrouter-image --registry=https://registry.npmjs.org/
Confirm the installation, explain how to reload DSH, and tell me where the settings page is (Settings → 图像生成).
```

### 手动装

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
dsh plugin --profile desktop add dsh-openrouter-image@latest --registry=https://registry.npmjs.org/
```

重启 DSH、刷新页面,打开 **设置 → 图像生成**。更新就是再跑一次同一条命令。

**包还没发到 npm 时**(现在就是这个状态),同一条命令换个包源 —— 仓库根目录就是包,所以 Git 源可以直接用:

```powershell
dsh plugin --profile desktop add github:fancyui/dsh-openrouter-imagen
# 或本地 tarball / 目录
dsh plugin --profile desktop add X:\github\dsh-openrouter-imagen\dsh-openrouter-image-0.1.0.tgz
```

### 手动挂载(不走 CLI)

不想让 CLI 动 profile 的 `pnpm-lock.yaml`,就手工挂 —— **两步缺一不可**:

1. 让包能从 profile 按裸名解析到 —— 建一个指向包目录的 junction(pnpm 的 `nodeLinker: hoisted` 用的是真实目录而非符号链接,这一点很重要:**ESM 按真实路径解析依赖**,符号链接会让包内的 `import '@deepseek-ai/...'` 找不到):

   ```powershell
   $link = 'C:\Users\WR\.dsh\profiles\desktop\node_modules\dsh-openrouter-image'
   New-Item -ItemType Junction -Path $link -Target 'X:\github\dsh-openrouter-imagen'
   ```

   > 用 junction 时,包体仍住在仓库里,因此**包内**需要一层最小依赖链接(`node_modules/@deepseek-ai/{schemastery,dsh-tools}` 与 `node_modules/undici`),否则裸导入无法解析。若把包**复制**进 profile(真实目录),这一层就不需要。

2. 在 **`~/.dsh/profiles/desktop/cordis.patch.yml`** 里插入挂载行:

   ```yaml
   - insert:
       - id: openrouter-image
         name: 'dsh-openrouter-image'
         config:
           model: google/gemini-2.5-flash-image
           resolution: 1K
           aspectRatio: auto
           quality: auto
           outputFormat: png
           count: 1
   ```

3. **重启 DSH Desktop**。插件的挂载只在启动期发生(`patchReload: live` 只重载已有行的配置,不会新增挂载;实测把 insert 行写进去后不重启,`settings.section` 里不会出现条目)。

**两条通道只能选一条**:走 CLI 之后 `dsh.profile.bundles` 里已经有这个包,再插一行,同一个 `(kind, path)` 的 web 路由会被注册两次,整个插件树在启动时失败。

### 为什么改 profile 的 `package.json` 不行

`dsh.profile.bundles` 是**被 launcher reconcile 的**:本机实测,手工加进去的依赖与 bundle 条目在启动时被读到(那一次确实挂载了,并抛出了插件自身的错误栈),但启动过程中该清单被重写回去,下一次启动就已经不含它了。

所以要么走上面的 `cordis.patch.yml` 通道(用户层,不被 reconcile —— 实测跨两次重启内容原样保留),要么用官方 CLI 把依赖真正落到 `pnpm-lock.yaml`:

```bash
dsh plugin --profile desktop add dsh-openrouter-image
```

**不要两个通道同时用**:同一个 `(kind, path)` 的 web 路由会被注册两次,重复的路由模式会让整个插件树在启动时失败。

### 依赖分层(为什么不提交 `node_modules`)

本包按 [dsh-skills-manager](https://github.com/MichengAI/dsh-skills-manager) 的同一套约定声明依赖,**源码进仓库、`node_modules` 由安装时生成**:

| 类别 | 放在哪 | 谁提供 |
| --- | --- | --- |
| `@deepseek-ai/*`(cordis、dsh-tools、schemastery、dsh-client-ui-*) | `peerDependencies` + `peerDependenciesMeta.optional` | DSH 本体(profile 里已 hoisted),插件**不能**自带第二份 —— 两个 cordis 实例会各建一套 Context |
| `react` | 同上 | 页面运行时(`window.__ModuleLoader__`),Client 半边只 `require('react')` |
| `undici` | `dependencies` | 随包安装,是唯一真实的第三方运行时依赖 |

peer 之所以标 `optional: true`:公共 registry 上 `@deepseek-ai/dsh-client-ui-settings` 只有 `0.0.1-rc.*`,与 DSH Desktop 自带的 `0.1.5-rc.2` 对不上;不标 optional,包管理器会去装一份版本不符的副本(或直接报错),而这些包本来就由宿主提供。

用 `npm pack --dry-run` 可以先看 tarball 里到底装了什么(`files` 白名单已限定为 `lib`、`cordis.patch.yml`、`README.md`、`LICENSE`)。

## 使用

1. 打开 **设置 → 图像生成**。这一页只剩**长期配置**:密钥、模型、Provider 排序、保存目录。逐次调整的参数在输入框上方(见下一节),**保存配置按钮在本页最下方**。
2. 填 **API Key**(在 openrouter.ai/keys 创建)→ 点 **保存配置**。Key 以 `role('secret')` 存进设置文件,服务端从不回传,输入框是只写的(留空 = 不修改)。
3. 点 **测试 Key** 验证(打 `/api/v1/key`,显示额度与用量),点 **拉取模型列表** 从 `/api/v1/images/models` 选模型。
4. 直接在对话里让 AI 生成 —— 模型会调用 `openrouter_generate_image`,那次调用的卡片会把图画出来,并给出**保存目录的打开链接**。

### 生成的文件存到哪

| 情况 | 落盘位置 |
| --- | --- |
| 会话有工作目录(打开过项目) | `<工作目录>/<保存目录>/` —— 默认 `generated-images/`,即**项目文件夹里** |
| 会话没有工作目录 | DSH 附件库(`~/.dsh/attachments/...`) |
| `保存目录` 留空 | 同上,只存附件库 |

- `保存目录` 填**绝对路径**就照用,填相对路径则相对当前会话的工作目录。目录不存在会自动创建。
- 无论哪种情况,**图片都会同时提交为 durable attachment** —— 那是它能在对话里渲染出来的唯一凭据;`保存目录` 只决定那份**文件副本**放哪。
- 同名文件**永不覆盖**:同一秒内的第二次生成会写成 `...-2.webp`。
- 落盘用的是 `exec.agent.session.header.cwd`,也就是 `read`/`write`/`edit` 解析相对路径用的同一个根。

### 输入框上方的那一条

插件在 **composer 上方**(`conversation.input.dock`)注册了一条控件,由输入框右侧的 **「图像」按钮**(`conversation.input.right`,紧挨着内置的「识图」)控制显隐 —— 默认收起,不打开就跟没装插件一样:

- **一行**:分辨率 / 宽高比 / 质量 / 格式 / 数量 / **背景** / **种子**,后面接参考图缩略图与状态文字 —— 改哪个就写哪个。它们写的是**同一个设置命名空间**,也就是模型工具读取的那一份,所以在这里选的参数就是下一次生成(包括 AI 自己发起的那次)使用的参数。**这些项已经不在设置页里**,只有这里能改。
- **种子**:**留空 = 每次随机** —— 由插件自己抽一个数字发给 OpenRouter,并把抽到的值回报出来(OpenRouter 的 `seed` 是"指定了就尽量确定性采样",不指定就没有可复现的种子可谈)。一次生成结束后,这个数字会**自动填回输入框、并写进设置**,于是下一次生成会沿用同一颗种子;想换一张就点旁边的 **「随机」** 清空它。非整数的输入**就地报错、不写进设置**;种子只在**失焦或回车**时提交。
- 原来的**附加参数**输入框已经从这里去掉(面板只剩一行);`extraJson` 仍然有效,但只在 `settings.yaml` / composition 的 `base` 层里配置。
- **参考图** —— 在页面任意位置(包括输入框里)**粘贴图片**,就会暂存为参考图、自动展开这一条并显示缩略图;它会被**下一次成功的生成**消费掉。失败不丢弃,便于重试。
  - 缩略图可以**点击单张移除**(本页粘贴的图片字节还在手里);刷新页面之后粘贴的旧图只剩「清空参考图」。
  - 暂存内容只存在 Host 内存里,不进 `settings.yaml` —— 它是这一次性的输入,不是配置。

### 为什么粘贴不算附件

本插件的参考图链路**根本不需要对话模型看见图片**:Host 直接把它发给 OpenRouter。但作为**消息附件**时,发送前会按当前对话模型的输入模态校验,文本模型会直接拒绝发送并提示「当前模型不支持图片,请切换支持图片的模型」—— 消息发不出去,参考图也就无从用起。

所以插件接管了 `paste`:粘贴图片一律作为参考图,并自动展开面板让你看到它去了哪里。**要给模型看的图片,用输入框自己的附件按钮**(或拖拽),那条路径完全不受影响。

### 对话里的图片卡片

`tool.call.toolview` 是按工具名分发的键控槽位,插件为 `openrouter_generate_image` 注册了自己的卡片(`GeneratedImagesCard`):

- 从 `block.content` 里取出 `{ type: 'image', attachment }` 块,再用 owner 传下来的 **`loadImage`**(`MessageImageLoader`,按 Session 授权)换到可显示的 URL —— 插件不直接碰 attachment 存储。
- **不注册这张卡片时**,没有专属 view 的工具会落到通用行,图片块被压平成文本 —— 这就是"只看到 `文件已存:...`"的原因。
- 卡片同时覆盖**运行中**(转圈 + 提示词)和**失败**(红字错误)两种状态。
- **底部一行就是"存到哪了"的答案**:目录文本 + **「打开文件夹」** + **「复制路径」**。「打开文件夹」走的是产品自带的目录应用目录(`dsh-host-open-in-app` 的 `/open-in-app/apps` 与 `/open-in-app/open`,也就是会话头部 "Open In..." 用的那一套),并且会复用你在那里记住的应用(`localStorage: dsh.open-in-app.choice`);主机没装任何目录应用时按钮会就地报错,「复制路径」仍然可用。
- **点图片本身**会调用 owner 的 `openFile`,把文件开在右侧栏里。这里有一个**绕行**:`dsh-client-ui-chat` 的 `fileAddressFor` 会把「工作目录内的绝对路径」改写成**会话相对**文件地址,而本机这个版本读不回那种地址 —— 侧栏会显示 `/generated-images/xxx.png` 并落到文件夹(folder)视图;同一个文件以完整绝对路径交出去就能正常显示(用户实测:相对形式 = broken,`X:/github/...` = 正常)。改写是一次**大小写敏感**的 `startsWith`,而 Windows 路径不区分大小写,所以卡片交出去之前把盘符小写(`X:` → `x:`)即可保住绝对形式,读的还是同一个文件。**只有 opener 看到这个小写盘符**,卡片与工具结果里显示的路径仍是正常写法。卡片同时会把 Host 万一回传的相对路径按视图 `cwd` 补成绝对路径,保证相对值永远不会进侧栏。
- **同一个坑在插件够不着的地方还有两处**:聊天里模型写出的路径链接、以及「交付文件」卡片上的**「打开」按钮**,都不经过这张卡片 —— 它们各自调 `dsh-client-ui-chat` 的 `openFile`,同样被改写成相对地址。用户看到的现象正是这条线索:**悬停提示里是绝对路径(`X:\github\…\out.png`),点开后侧栏里就只剩 `/generated-images/out.png`**。这两处只能在一个更靠下的接缝上修:`apply` 用 `ctx.inject(['sidebarRight'], …)` 等到右侧栏服务就绪,然后把 `openResource`(以及带 session 的 `openResourceIn`)包一层 —— **凡是 path 段是「会话相对」的 `dsh-resource://file/session/<id>/…` 地址,就用该 Session 的 workspace root(`ctx.get('sessions').list.getSnapshot().byId[id].cwd`)还原成绝对拼写**再交出去;已经是绝对拼写、`absolute` scope、或 Session/cwd 未知的地址一律原样放行。这样聊天链接、交付文件按钮、本卡片、以及侧栏文件树(`dsh-client-ui-sidebar-files` 自己的 `fileAddressFor`)一起恢复正常,而且**只改地址、不动 `options`**。写入被拒(冻结对象)或服务不存在时安静地不装;`ctx.effect` 的 disposer 会在插件停用/卸载时把原方法还原(预检里逐个断言)。
- 卡片底部还会显示**本次用的种子**(例如 `种子 1844679（随机）`),并把它**交回输入框上方的那条面板**——由面板写进设置,因为 Host 读的是设置而不是输入框里显示的值。想复现就留着,想换一张就点面板里的「随机」。

### 已知限制

- 对话里图片的显示尺寸**由这张卡片自己决定**(单图最大 420px 宽,多图走网格),不再套用产品默认呈现器的尺寸。
- 卡片依赖 `block`(`ToolCallBlock`)与 `loadImage` 的运行时形状。这两个类型在本机**没有可读声明**(Inspect 不返回 referencedTypes,安装的客户端包也不带 `.d.ts`),所以这里是照 `dsh-client-ui-tool` 里内置 `read_image` 卡片的实际用法写的,并由 `preflight-client.mjs` 用形状化的 `block` 固定住;产品若改这两个类型,卡片会**降级成占位块而不是抛错**。
- 保存目录与种子都来自 Host 渲染的那两行文本(`保存目录：` / `种子：`),不是结构化字段 —— 卡片只解析这两行,拿不到就只显示图片。种子那行**排在 `文件：` 之前**,否则会被当成又一个文件路径。

### 配置项

写入 `~/.dsh/settings.yaml` 的 `openrouter-image` 命名空间(用户层覆盖 composition 的 `base` 层)。

其中 **`resolution` / `aspectRatio` / `quality` / `outputFormat` / `count` / `background` / `seed` 已经不在设置页暴露**,请从输入框上方的「图像」面板修改;**`extraJson` 两处 UI 都不再暴露**,只在 `settings.yaml` / composition 的 `base` 层里有效(它仍然会被原样合并进请求体)。两条路径写的是同一个命名空间,下面的表只是说明字段含义:

| 字段 | 设置页 | 说明 |
| --- | --- | --- |
| `apiKey` | ✅ | OpenRouter 密钥,`secret` 角色 |
| `model` | ✅ | 图像模型 id,如 `google/gemini-2.5-flash-image` |
| `providerSort` | ✅ | `price` / `throughput` / `latency` |
| `saveDir` | ✅ | 生成文件的存放目录,默认 `generated-images`;留空只存附件库 |
| `resolution` | 「图像」面板 | `512` / `1K` / `2K` / `4K` / `auto` |
| `aspectRatio` | 「图像」面板 | `1:1`、`16:9` 等,`auto` 交给模型 |
| `quality` | 「图像」面板 | `auto` / `low` / `medium` / `high` |
| `outputFormat` | 「图像」面板 | `png` / `jpeg` / `webp` |
| `count` | 「图像」面板 | 1-10(部分模型只支持 1) |
| `background` | 「图像」面板 | `auto` / `transparent` / `opaque` |
| `seed` | 「图像」面板 | 字符串形式保存;**空 = 每次随机**(插件抽一个数字并在结果里回报);非空必须是整数 |
| `extraJson` | 仅 settings.yaml | 合并进请求体的附加 JSON 对象;面板与设置页都不再提供输入框 |

### 工具参数

`openrouter_generate_image(prompt, model?, count?, resolution?, aspect_ratio?, quality?, background?, seed?, reference_images?, reference_files?)`

- `prompt`:必填。**按商业摄影的结构写**:主体与动作 → 环境与道具 → 光线(主光/辅光/轮廓光/色温/时段) → 镜头与构图(焦段/景深/机位/画幅) → 风格与质感 → 画面内文字(逐字给出,注明大小写)。用具体名词与参数,不要写「高级 / 大气 / 好看」这类空词。
- **带参考图时不要在提示词里描述参考图。** 生图模型自己会读参考图(它是 `input_references`,不是文本);再从文字里复述一遍产品外观(外形、颜色、logo、端子、结构)只会与图像本身冲突、降低还原度。要锁住主体就写一句「保持参考图中的产品外观不变」。注意:`vision-router` 之类的插件会把附图先转成**文字描述**喂给对话模型,那段描述**不应该**被抄进提示词 —— 工具说明里已明确禁止。
- **回复保持一句话。** 调用成功后卡片已经展示参数、种子、保存路径与费用,模型不需要复述。
- `seed`:整数,用于复现同一张图;省略则用设置里的值(**空 = 插件抽一个随机种子并在结果里回报**,见 `种子：` 那行)。
- `background`:`auto` / `transparent` / `opaque`。
- `reference_images`:http(s) URL 或 data URL,最多 4 张(image-to-image)。
- `reference_files`:本机绝对路径,**必须位于会话工作目录内**(越界会被拒绝),由 Host 读取并内联为 data URL。
- 未声明的参数会被拒绝(工具根 schema 是开放对象,`execute` 里补上了封闭检查)。工具声明的拼写是 **snake_case**(`aspect_ratio`);JSON 路由 `/generate` 同时兼容 camelCase(`aspectRatio`)。
- **每次调用的参数会覆盖面板,并且实际发出的值会回传。** 对话模型看不到你的「图像」面板,所以结果里带一个 `params` 对象(`model` / `count` / `resolution` / `aspect_ratio` / `quality` / `output_format` / `background` / `seed` / `referenceCount`),卡片上也会多一行 `参数：2K · 4:3 · high · jpeg`。哪个值真正到了提供商,以它为准 —— 之前 `aspect_ratio` 的驼峰/蛇形拼写不一致,导致面板值静默生效、覆盖失效,就是这么暴露出来的。
- 返回值额外带 `outputDir` / `outputDirRelative`(项目内有工作目录时)、`seed` / `seedRandom`(本次实际用的种子,以及它是否为随机抽取),以及每张图的 `filePath`(绝对路径)。

## 两个实现要点

**出站 HTTP 必须显式走代理。** Node 的全局 `fetch` 完全忽略 `HTTP_PROXY`/`HTTPS_PROXY`,而 undici 包的 `setGlobalDispatcher` 也修不好(全局 fetch 跑在 Node 内置的另一份 undici 上)。本机出网依赖 `http://127.0.0.1:10808`,所以 `lib/index.js` 用 `undici` 的 `fetch` 配 `EnvHttpProxyAgent`,解析顺序与 `dshmarket/lib/net.js` 一致。这个代理池**属于当前 Fiber**:在 `apply()` 里懒建,由 `ctx.effect` 的 disposer 关闭,不会跨卸载/HMR 泄漏连接。

**前端不碰 Remote/typert。** 浏览器半边只用同源 `fetch('/openrouter-image/api/...')` 调 Host 自己注册的 `webServer` 前缀路由(`kind: 'prefix'`),接口有 `config` / `test` / `models` / `generate`。这比注册一个 `@Remote` 服务面简单得多,也不需要装饰器编译。

## 安全与授权

- **路由有信任闸门。** 每个请求先过 `connection.requestRejection(req)` —— 也就是 DSH 自带路由用的同一道闸:Host/Origin 不匹配返回 **403**,没有浏览器鉴权 cookie 返回 **401**,两者都不会碰到 OpenRouter,也不会改设置。没有 `connection` 服务的载体(比如离线预检)则跳过闸门。
- **`/generate` 是花钱接口。** 它能用你存在 `settings.yaml` 里的 key 发起真实调用,所以闸门 + 同源限制是它唯一的门禁。
- **密钥不外泄。** `apiKey` 是 `role('secret')` 设置,任何设置读取接口都不返回它,插件也从不把它回显给浏览器。
- **本地参考图被限制在会话工作目录内。** `reference_files` 由**模型**给出,而这些字节会发往第三方 API;`dsh-fs-local` 能解析任意绝对路径、文件沙箱只管写不管读,所以越界路径会被直接拒绝(报错提示先复制进项目,或改用 `reference_images` 的 URL/data URL)。
- **工具参数是封闭的。** `defineTool` 生成的根 schema 是开放对象,未声明的键会在 `execute` 里被拒绝,而不是被展开进请求体。
- **`extraJson` 不能越权。** 它不能覆盖 `model` / `prompt` / `input_references` —— 否则配置里的一段 JSON 就能悄悄换模型(换账单)或换提示词。
- **取消会被观测。** 工具把 `exec.signal` 与自身的 10 分钟上限合并成 `AbortSignal.any([...])` 传给请求:取消一轮对话会真的放弃这次付费请求,而不是让它在后台跑完。
- **费用与数据去向(须知):** 每次调用都**真实计费**在你自己的 OpenRouter 额度上(费用在结果里回报);**提示词与参考图会离开本机**发往 OpenRouter,使用的模型与密钥来自 Settings → 图像生成;插件不向任何其他地方发送数据。本工具对该会话里所有 agent(含子 agent)可见,所以一次自主调用同样会花钱。

## 发布

包在仓库根目录,**`node_modules/` 不进仓库**(`.gitignore` 已挡),它由 `package.json` 在安装时生成。

```bash
cd X:\github\dsh-openrouter-imagen
git init -b main            # 只做一次
git add .
git commit -m "dsh-openrouter-image 0.1.0"
git remote add origin https://github.com/fancyui/dsh-openrouter-imagen.git
git push -u origin main
```

`.gitignore` 同时挡掉 `generated-images/`、`preview/` 与本机 `*.log`:都是运行产物。

发 npm(可选 —— GitHub 只是源码托管,`npm install` 走的才是 registry):

```bash
npm pack --dry-run    # 确认 tarball 内容
npm publish
```

## 开发迭代

- **Host 代码改动**(`lib/index.js`)需要重启 DSH —— 模块在启动时只导入一次。
- **Client 代码改动**(`lib/client.js`)通常刷新页面即可。
- 离线自检(不需要启动 DSH):

  ```powershell
  cd X:\github\dsh-openrouter-imagen
  node preflight.mjs          # Host:注册、路由、代理出网、落盘位置、工具渲染
  node preflight-client.mjs   # Client:模块契约、四个槽位、设置页/面板/卡片/粘贴行为
  node preflight-install.mjs  # 安装:裸名解析、profile 挂载行、各入口存在
  node preview-settings.mjs   # 离线排版预览:preview/settings.html + composer.html
  ```

  脚本的根目录由 `import.meta.url` 推出,克隆到任何路径都能跑。

  `preflight-client.mjs` 里有一个很小的 React 替身:`useState` 会真的触发下一次渲染、`useEffect` 会真的执行,所以「图片卡片在 loader resolve 之后才出现」这件事是被测到的,而不是靠 no-op effect 蒙过去。

## 卸载

删掉 profile 里的 `node_modules/dsh-openrouter-image` junction、从 profile 的 `cordis.patch.yml` 移除那条 `insert` 行,重启即可(若走过 CLI 安装,则用 `dsh plugin --profile desktop remove dsh-openrouter-image`)。设置文件里的 `openrouter-image` 段落可一并删除。
