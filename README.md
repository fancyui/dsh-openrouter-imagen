# dsh-openrouter-imagen

> 仓库与 npm 包**同名**:[`fancyui/dsh-openrouter-imagen`](https://github.com/fancyui/dsh-openrouter-imagen),包就在仓库根目录。

一个**可安装、常驻**的 DSH 插件:用 OpenRouter 的 Image API 生成图片,配置持久保存,重启后依然有效。

- **Host 半边**:声明 `openrouter-imagen` 设置表单(`Config` 的 volatile 字段)、注册 `openrouter_generate_imagen` 工具、以及 `/openrouter-imagen/api/*` 同源 JSON 路由。
- **Client 半边**:注册三个槽位 —— **设置 → 图像生成** 的配置页、输入框上方的参数条(`conversation.input.dock` 加 `conversation.input.right` 的「图像」按钮)、以及本工具在对话里的卡片(`tool.call.toolview`,把生成的图直接画出来)。
- **自带 skill**:`skills/openrouter-imagen/SKILL.md` 随包一起安装,由 `lib/skills.js` 注册进技能表 —— **装插件就等于装了 skill**,不需要第二步,也不用往 `~/.dsh/skills` 里丢文件。

## 兼容性

需要 **DSH ≥ 0.1.7-rc.1**。0.1.7 改了设置服务的契约,0.1.6 及更早的写法在 0.1.7 上会**启动即失败**:

| | ≤ 0.1.6 | ≥ 0.1.7(本插件 0.1.1 起) |
| --- | --- | --- |
| 声明设置 | `ctx.settings.register(NS, Config, { base })` 返回 scope | 导出的 `Config` **就是**表单;命名空间 = 插件行的 `id` |
| 读值 | `scope.get()` | `apply(ctx, config)` 收到的 volatile 引用,`config.field.get()` |
| 写值 | `scope.update(patch)` | `ctx.settings.update(NS, patch)` |
| 可编辑字段 | 任意 | 必须声明 `.volatile()`,否则该行不可写(`settings.update` 抛 `No configurable plugin entry`) |

`inject` 也不再需要 `'settings'`:设置服务是 `ctx.get('settings')` 惰性取的。升级 DSH 后如果插件被 runtime 静默禁用,日志里会出现 `Plugin dsh-openrouter-imagen@x is incompatible with dsh y: peerDependencies {...}` —— 那是 `peerDependencies` 的版本区间没覆盖新运行时,补区间(本包做法)或临时 `dsh plugin allow-version` 放行。

**0.2.0 起,四条 `@deepseek-ai/dsh-*` peer 区间写成 `0.1.0-rc.8 || 0.1.1-rc.2 || 0.1.2-rc.1 || ^0.1.5-rc.1`。** 前三个精确版本保住老运行时的支持,末尾的 `^` 区间把 `0.1.5-rc.1` 以上的所有 `0.1.x`(含 0.1.7 正式版、0.1.8……)一次覆盖。之前逐版本穷举,于是 DSH 一发正式版,整包就被判为不兼容而**静默禁用** —— 那正是 0.1.7-rc.1 这次踩到的坑。

`npm run smoke` 用桩 Context 真跑一遍 Host 半边,断言上面几条契约(不会发网络请求,也不花钱)。

## 目录结构

```
.
├── package.json            # main / exports["./client"] / dsh.bundle.patch / dsh.client
├── cordis.patch.yml        # bundle 层:插入 openrouter-imagen 插件行
├── LICENSE
├── lib/
│   ├── index.js            # Host 半边(Cordis 插件)
│   ├── skills.js           # 自带 skill 的 provider(子插件,inject: ['skills'])
│   └── client.js           # Client 半边(window.__ModuleLoader__.load)
├── skills/
│   └── openrouter-imagen/
│       └── SKILL.md        # 随包安装的 skill(带 frontmatter,可单独拷进 ~/.dsh/skills)
├── preflight.mjs           # Host 半边自检
├── preflight-client.mjs    # Client 半边自检
├── preflight-install.mjs   # 安装 / 挂载自检
├── smoke-boot.mjs          # 0.1.7 契约冒烟(Host 半边真跑,桩 Context)
└── preview-settings.mjs    # 设置页、输入条的离线排版预览
```

发布到 npm 时只带 `files` 白名单里的东西(`lib/`、`skills/`、`cordis.patch.yml`、`README.md`、`LICENSE` + `package.json`),自检脚本留在仓库里、不进 tarball。

`node_modules/` **不进仓库** —— 它是 `package.json` 装出来的产物,`.gitignore` 一并挡掉 `generated-images/`、`preview/`、`*.log` 与本机打出的 `*.tgz`。

## 安装

标准通道是官方 CLI:`dsh plugin` 把余下的参数转发给 **profile 目录里的 pnpm**,依赖落进 `pnpm-lock.yaml`,启动时 launcher 据此把包挂进 bundle 栈。下面以本机 `desktop` profile 为例。

### 让 agent 装

把下面这段发给能执行本地终端的 agent:

```
Install dsh-openrouter-imagen into my DSH desktop profile using the official npm registry.
Run: dsh plugin --profile desktop add dsh-openrouter-imagen --registry=https://registry.npmjs.org/
Confirm the installation, explain how to reload DSH, and tell me where the settings page is (Settings → 图像生成).
```

### 手动装

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
dsh plugin --profile desktop add dsh-openrouter-imagen@latest --registry=https://registry.npmjs.org/
```

重启 DSH、刷新页面,打开 **设置 → 图像生成**。更新就是再跑一次同一条命令。

**包还没发到 npm 时**(现在就是这个状态),同一条命令换个包源 —— 仓库根目录就是包,所以 Git 源可以直接用:

```powershell
dsh plugin --profile desktop add github:fancyui/dsh-openrouter-imagen
# 或本地 tarball / 目录
dsh plugin --profile desktop add X:\github\dsh-openrouter-imagen\dsh-openrouter-imagen-0.2.0.tgz
```

### 手动挂载(不走 CLI)

不想让 CLI 动 profile 的 `pnpm-lock.yaml`,就手工挂 —— **两步缺一不可**:

1. 让包能从 profile 按裸名解析到 —— 建一个指向包目录的 junction(pnpm 的 `nodeLinker: hoisted` 用的是真实目录而非符号链接,这一点很重要:**ESM 按真实路径解析依赖**,符号链接会让包内的 `import '@deepseek-ai/...'` 找不到):

   ```powershell
   $link = 'C:\Users\WR\.dsh\profiles\desktop\node_modules\dsh-openrouter-imagen'
   New-Item -ItemType Junction -Path $link -Target 'X:\github\dsh-openrouter-imagen'
   ```

   > 用 junction 时,包体仍住在仓库里,因此**包内**需要一层最小依赖链接(`node_modules/@deepseek-ai/{schemastery,dsh-tools,dsh-skill}` 与 `node_modules/undici`),否则裸导入无法解析。若把包**复制**进 profile(真实目录),这一层就不需要。

2. 在 **`~/.dsh/profiles/desktop/cordis.patch.yml`** 里插入挂载行:

   ```yaml
   - insert:
       - id: openrouter-imagen
         name: 'dsh-openrouter-imagen'
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
dsh plugin --profile desktop add dsh-openrouter-imagen
```

**不要两个通道同时用**:同一个 `(kind, path)` 的 web 路由会被注册两次,重复的路由模式会让整个插件树在启动时失败。

### 依赖分层(为什么不提交 `node_modules`)

本包按 [dsh-skills-manager](https://github.com/MichengAI/dsh-skills-manager) 的同一套约定声明依赖,**源码进仓库、`node_modules` 由安装时生成**:

| 类别 | 放在哪 | 谁提供 |
| --- | --- | --- |
| `@deepseek-ai/*`(cordis、dsh-tools、dsh-skill、schemastery、dsh-client-ui-*) | `peerDependencies` + `peerDependenciesMeta.optional` | DSH 本体(profile 里已 hoisted),插件**不能**自带第二份 —— 两个 cordis 实例会各建一套 Context |
| `react` | 同上 | 页面运行时(`window.__ModuleLoader__`),Client 半边只 `require('react')` |
| `undici` | `dependencies` | 随包安装,是唯一真实的第三方运行时依赖 |

peer 之所以标 `optional: true`:公共 registry 上 `@deepseek-ai/dsh-client-ui-settings` 只有 `0.0.1-rc.*`,与 DSH Desktop 自带的 `0.1.5-rc.2` 对不上;不标 optional,包管理器会去装一份版本不符的副本(或直接报错),而这些包本来就由宿主提供。

用 `npm pack --dry-run` 可以先看 tarball 里到底装了什么(`files` 白名单已限定为 `lib`、`skills`、`cordis.patch.yml`、`README.md`、`LICENSE`)。

## 使用

1. 打开 **设置 → 图像生成**。这一页只剩**长期配置**:密钥、模型、Provider 排序、保存目录、技能开关。逐次调整的参数在输入框上方(见下一节)。**改动自动保存**,页面底部只显示保存状态,没有保存按钮。
2. 填 **API Key**(在 openrouter.ai/keys 创建)。Key 以 `role('secret')` 存进设置文件,服务端从不回传,输入框是只写的(留空 = 不修改;输入新 Key 即自动保存)。点 **测试 Key** 验证(打 `/api/v1/key`,显示额度与用量)。
3. **模型可以添加多个**:点「拉取模型列表」从 `/api/v1/images/models` 拉取线上目录,下拉里选中一个就加入列表;也可以手动输入模型 id。**点列表里的一行即设为默认**,下一次生成就用它;添加了多个之后,输入框上方的「图像」面板里也能临时切换。
4. 直接在对话里让 AI 生成 —— 模型会调用 `openrouter_generate_imagen`,那次调用的卡片会把图画出来,并给出**保存目录的打开链接**。

### 随包安装的 skill

包里的 `skills/openrouter-imagen/SKILL.md` 是一份**给模型看**的出图手册,由 `lib/skills.js` 通过 `ctx.skills.registerProvider()` 注册进 DSH 技能表。装插件时就装好了,**不需要手动往 `~/.dsh/skills` 里丢文件**,也不会出现「插件升级了、skill 还是旧的」。

| | |
| --- | --- |
| 名字 | `openrouter-imagen`(kebab-case,技能表里就这一条) |
| 触发 | 描述**只写「什么时候用」**,并且中英双语同时点名**生成**与**修改**两条意图(生成 / 绘制 / 改背景 / 换风格 / 换光线 / 去物加物 / 局部重绘 / 扩图 / 出变体 …,text-to-image / image-to-image / restyle / relight / inpainting …) |
| 优先级 | `BUNDLED_SKILL_RANK`(600),**低于**所有文件系统来源 —— 你在 `~/.dsh/skills` 或项目 `.dsh/skills` 里放同名 skill 会**覆盖**它,而不是撞名 |
| 资源目录 | `skills/openrouter-imagen/`(SKILL.md 里提到相对路径时按它解析) |
| 开关 | 设置 → 图像生成 → **技能** 的开关,关掉即不再挂载。这份 SKILL.md 带标准 frontmatter,单独拷进 `~/.dsh/skills` 也能被文件系统 provider 直接读 |

**描述有 500 字符的硬预算。** `@deepseek-ai/dsh-tool-skill` 的 `catalogDescriptionMaxLength` 默认 500,而且截的是**尾部**(`slice(0, 497) + '...'`)—— 也就是说超出的部分是**看不见**的,trigger 词写在后半段等于没写。所以这份描述是 trigger-first:先两条意图、再一串代表性画风当 trigger、再交付物类型,中英各来一遍,并且明写「**或任何其他风格**」以表明这不是一张封闭清单,一共 488 字符。`npm run smoke` 会断言这个预算、两条意图、trigger 覆盖,以及那句「不限」。

技能正文(12796 字符,11 节)只在模型真的调用 `skill` 之后才进上下文,所以它可以很长 —— 那里放的是工具说明写不下的东西:

- **教推导,不教清单** —— 见下一节。这是整个 skill 的主轴。
- **意图判断**:生成 / 修改 / **不要出图**三分类,含反例(问「图里是什么」走视觉理解;裁剪缩放压缩转格式走确定性脚本 —— 交给生图模型会重画像素)。
- **口语 → 提示词的翻译四步**:定媒介并推出它的轴 → 抽槽位 → 缺的补该媒介的专业默认值(**不反问**)→ 写成提示词;附「空词换参数」对照表(「高级」→ 低调布光 + 大面积留白 + f/8 全清晰;「可爱」→ 大头比例 + 圆角线条 + 暖色)。
- **8 个完整示例**,覆盖摄影 / 线条图 / 卡通 / 水彩插画 / 改图 / **跨画风迁移**(照片 → 线稿),外加两个**表里没有的画风**的推演示范(国风水墨、丝网印刷)。
- 摄影的六种分镜配方、参考图三种给法、迭代与排错,包括「改图后主体变形了 → 提示词里多半复述了主体外观」。

### 教推导,不教清单(两次踩坑的记录)

**第一版**写的是「按**商业摄影**的结构写:光线 → 镜头与构图 → …」,这是一条**只对摄影成立的骨架**。用户说「画个卡通狗」时,模型照样往里填 `85mm f/8`、柔光箱、色温 —— 得到的是照片。

**第二版**改成「先定画风族,再查表」,列了 8 个族。这修好了症状,但犯的是同一个错:**把判断换成了查表**。用户要「国风水墨」「建筑效果图」「蒸汽波」时,模型会把它硬塞进最近的族,写出四不像;而且表一定不全。

**现在给的是推导方法**,四步:

1. **照用户说的写** —— 他说水彩就是水彩,不要先归类再翻译。
2. **问:这种媒介靠什么被认出来?** 认得出它的那几个特征,就是你要写的轴。
3. **问:它没有什么?** 不属于它的轴一律删掉 —— 卡通没有焦段光圈,照片没有描边上色,像素画没有抗锯齿和渐变。
4. **用它自己的词汇写。**

skill 里那张表被明确标成「**几个示范(不是清单)**」,并附两个**表外的推演示范**:

> 用户：「国风水墨的山水」
> 靠什么被认出来:墨色浓淡层次(焦/浓/重/淡/清)、留白与虚实、皴法笔触、散点透视。
> 没有什么:焦段光圈、柔光箱色温、描边、饱和彩色。
> → `Traditional Chinese ink-wash landscape on xuan paper, layered ink tones from dense black to pale wash, dry-brush cun strokes for rock texture, vast empty space for mist and water, scattered perspective with no vanishing point, monochrome with a single faint vermilion seal, no outlines, no saturated color.`

唯一的**硬规则**是一条否定约束(否定约束才需要点名,因为它防的是真错):**焦段、光圈、柔光箱、色温是摄影与照片级 3D 的器材与布光**,写进卡通、线稿、水墨、像素画里只会把画面拽向照片。附带区分:**「光线」不是摄影专属,但「布光」是** —— 任何画风都能把光写成*画面内容*(「晨光穿过树间」),写成*器材与布光*才是摄影。

连「六段骨架」也改成了**检查表不是模板**:顺序与详略跟着媒介走,并可以按需加轴(建筑效果图要写材质与透视,像素画要写网格与调色板数量)。

用户没指定画风时,按交付场景选一个合理的默认(图标/线稿→线条,贴纸/可爱→卡通,海报→平面,产品图/人像→摄影),**并在回复里说明选了什么**,给他改的机会 —— 而不是停下来问。

`npm run smoke` / `node preflight.mjs` 会断言两个层次(工具说明 + skill 正文)**都在教推导**:必须出现「不要往固定几类里硬塞」「靠什么被认出来」「它没有什么」,并且**不得**再出现 `画风族` / `先定画风` / `商业摄影的结构` 这类把判断换成查表的措辞。

工作分工在**三个层次**上都写明了 —— 对话模型只做两件事:听懂需求、写专业提示词;画由生图模型完成:

1. **工具说明**(always in context):开头就是 `Generate AND edit ...` 加「出图与改图都走这里」「用户贴图说『改一下』时不要回答『无法修改图片』」。
2. **catalog 描述**(决定要不要加载 skill):中英双语的生成与修改 trigger,列一串代表性画风并明写「或任何其他风格」。
3. **SKILL.md 正文**:`## 你的职责只有两件事` 一节 + `## 第二步：定媒介，然后推出它的轴`。

两个实现上的选择值得说明:

- **`skills` 不在主插件的 `inject` 里。** 技能表是可选基础设施,把它写进 `inject` 会让**整个插件**(包括那个付费工具)在没有技能服务的载体上被停住。所以 skill 半边是一个**子插件**(`ctx.plugin(bundledSkill)`),自己 `inject: ['skills']` —— 服务不来就它自己等,工具照常注册。`dsh-univer-office` 用的是同一个拆法。
- **文件在 `apply` 时读一次**,不是每次列目录都读;而且读失败**只记一条 warning、不抛** —— 打包漏了 `skills/` 目录时,你失去的是一条技能,不是整个出图能力。`npm run smoke` 会断言这条链路(候选字段、rank、frontmatter 已剥离、描述与 frontmatter 一致,以及没有技能服务时仍能启动)。

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

`tool.call.toolview` 是按工具名分发的键控槽位,插件为 `openrouter_generate_imagen` 注册了自己的卡片(`GeneratedImagesCard`):

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

写入 `~/.dsh/settings.yaml` 的 `openrouter-imagen` 命名空间(用户层覆盖 composition 的 `base` 层)。

其中 **`resolution` / `aspectRatio` / `quality` / `outputFormat` / `count` / `background` / `seed` 已经不在设置页暴露**,请从输入框上方的「图像」面板修改;**`extraJson` 两处 UI 都不再暴露**,只在 `settings.yaml` / composition 的 `base` 层里有效(它仍然会被原样合并进请求体)。两条路径写的是同一个命名空间,下面的表只是说明字段含义:

| 字段 | 设置页 | 说明 |
| --- | --- | --- |
| `apiKey` | ✅ | OpenRouter 密钥,`secret` 角色 |
| `model` | ✅ | 默认模型 id,如 `google/gemini-2.5-flash-image`;点模型列表里的一行即设为默认 |
| `models` | ✅ | 模型列表(最多 16 个)。`model` 为空时**第一个**作为默认;「图像」面板里也能从这份列表临时切换 |
| `providerSort` | ✅ | `price` / `throughput` / `latency` |
| `saveDir` | ✅ | 生成文件的存放目录,默认 `generated-images`;留空只存附件库 |
| `skills` | ✅ | 是否安装随包自带的 skill,默认开。关掉只是不再加载那份提示词手册,工具照常可用(见「随包安装的 skill」)|
| `resolution` | 「图像」面板 | `512` / `1K` / `2K` / `4K` / `auto` |
| `aspectRatio` | 「图像」面板 | `1:1`、`16:9` 等,`auto` 交给模型 |
| `quality` | 「图像」面板 | `auto` / `low` / `medium` / `high` |
| `outputFormat` | 「图像」面板 | `png` / `jpeg` / `webp` |
| `count` | 「图像」面板 | 1-10(部分模型只支持 1) |
| `background` | 「图像」面板 | `auto` / `transparent` / `opaque` |
| `seed` | 「图像」面板 | 字符串形式保存;**空 = 每次随机**(插件抽一个数字并在结果里回报);非空必须是整数 |
| `extraJson` | 仅 settings.yaml | 合并进请求体的附加 JSON 对象;面板与设置页都不再提供输入框 |

### 工具参数

`openrouter_generate_imagen(prompt, model?, count?, resolution?, aspect_ratio?, quality?, background?, seed?, reference_images?, reference_files?)`

#### 参数纪律:默认只填 prompt

先说清机制,因为「传参数」这个说法很容易讲糊:对话模型调用这个工具时,**能填两样东西,两样都是工具调用的参数**。

| | 位置 | 说明 |
| --- | --- | --- |
| **`prompt`** | 工具调用的 `prompt` | **必填,这是模型的活** —— 画面描述 |
| 几个可选参数 | 工具调用的同名参数(`model`/`count`/`resolution`/`aspect_ratio`/`quality`/`background`/`seed`) | **覆盖面板**,只在这一次生效 |

面板的值由插件自己填进发往生图模型的请求 —— 所以可选参数**留空就是用面板的值**,留空是正确行为、不是遗漏。模型唯一的规则:

> **默认只填 `prompt`,其余全部留空。** 用户**在这条消息里点名**了某个参数,才把那一个填上。

这条规则是针对一类真实故障写的:**用「规则」暗示模型去判断,它就会真的去判断**。早先的措辞是「`count` 要花钱,一张一张来」—— 那读起来就是在让对话模型替用户决定出几张;参数说明里还写过「every extra image costs money」,同样是往那个方向推。现在两处都删了,并在 `npm run smoke` / `node preflight.mjs` 里加了反向断言(出现 `一张一张来` 就直接 FAIL)。

模型明确被禁止做的判断(工具说明里逐条点名):

- 「这次适合出几张」
- 「这个主题配方形更好看」
- 「提高画质会更清楚」
- 「竖版更适合手机」

想建议可以,在回复里说一句;不要动手改。**「什么叫点名」也有反例表** —— 「画只猫,全身照」只填 `prompt`(「全身照」是取景,写进 prompt),而「画只猫,要竖的」才填 `aspect_ratio`。

#### 面板值不进 prompt(已实测:模型看不到面板)

那些参数由插件**作为 API 字段单独提交**给生图模型 —— 它们不需要、也不应该出现在 prompt 里。

实测确认:**对话模型看不到这个面板**。它不在模型的上下文里,插件也没有任何通道把面板值送给模型:

- `lib/index.js` 除了 `webServer` 之外不读任何服务 —— `npm run smoke` 断言 `ctx.get()` 只被问过 `webServer`;
- 工具说明是静态字符串(`defineTool` 只接受字符串,没有按请求求值的形式);
- Client 半边只调自己的 `/openrouter-imagen/api` 路由,不往对话里塞任何东西。

> 试过的一条路:DSH 的 `ctx.systemPrompt.section({ text: () => ... })` **确实**支持每次请求动态求值(`dsh-system-prompt/lib/index.js` 里 `typeof section.text === "function" ? section.text(context) : section.text`),把面板当前值喂进系统提示是可行的。但它要往**每个**请求里常驻一段文本,而且必须**重启 DSH** 才能生效(插件模块在启动时只加载一次),在本次会话里无法验证是否真的送达 —— 所以**没有采用**,代码里也没有留半成品。

于是 prompt 的规则是:

- **不要把那些字段值写进 prompt。** 写进去是重复;而且模型看不到面板的真实值,猜一个写进去还会和它打架。
- **prompt 里只写这条对话里提到过的参数**,并且用**画面语言**而不是复述数值。用户说「要 9:16」→ 写 `vertical composition, tall framing`(「9:16」这个数字对生图模型没有意义);用户说「要透明底」→ **干脆别描述背景**。
- 只有**会改变画面本身**的参数(画幅、背景)值得在 prompt 里呼应;分辨率 / 画质 / 数量 / 种子 / 格式写进 prompt 毫无意义。
- 用户没提画幅时,**按这句话的意图写构图,不要猜他的面板**。

#### 提交给 OpenRouter 的字段(完整清单)

模型看不到面板,但**必须知道请求里会有哪些字段** —— 否则它会把 `aspect_ratio`、`seed` 这些东西编进 prompt。所以这份清单同时写进了 skill 正文和工具说明,并由 `npm run smoke` 逐个字段断言(`API_FIELDS`,与 `lib/index.js` 的 `buildBody()` 对齐):

| API 字段 | 归谁管 | 工具参数 | 模型什么时候填 |
| --- | --- | --- | --- |
| `prompt` | **模型** | `prompt` | 每次都写 |
| `model` | 设置页「模型」(默认行) | `model` | 用户点名模型时 |
| `n` | 「图像」面板「数量」 | `count` | 用户点名张数时(1–10,只在 > 1 时提交) |
| `resolution` | 「图像」面板「分辨率」 | `resolution` | 用户点名分辨率时(`auto` 不提交) |
| `aspect_ratio` | 「图像」面板「宽高比」 | `aspect_ratio` | 用户点名画幅时(`auto` 不提交) |
| `quality` | 「图像」面板「画质」 | `quality` | 用户点名画质时(`auto` 不提交) |
| `background` | 「图像」面板「背景」 | `background` | 用户点名背景时(`auto` 不提交) |
| `seed` | 「图像」面板「种子」 | `seed` | 用户要复现 / 固定种子时(**总是提交**,留空则插件现抽) |
| `input_references` | 模型,或用户在输入框贴的图 | `reference_images`、`reference_files` | 需要图生图时(两者归并成这**一个**字段) |
| `output_format` | 「图像」面板「格式」 | **无** | 碰不了 |
| `provider` | 设置页「Provider 排序」 | **无** | 碰不了(只影响 OpenRouter 挑哪家上游,不影响画面) |
| `saveDir` | 设置页 | **无** | 碰不了 |
| `extraJson` 里的字段 | `settings.yaml` | **无** | 碰不了;原样并入,但不能覆盖 `model`/`prompt`/`input_references` |

**这是完整的清单。** 不在表里的字段 API 一概收不到 —— 想让画面出现什么,只能写进 prompt。标「填不了」的那几个连参数都没有,填了会被工具拒绝。

- `prompt`:必填。**照用户说的媒介写,用那种媒介自己的词汇** —— 不要往固定几类里硬塞。先问「它靠什么被认出来」(线条?笔触?材质?色块?像素网格?光影?),就写什么;再问「它没有什么」(卡通没有焦段光圈,照片没有描边上色,像素画没有抗锯齿和渐变),把不属于它的轴删掉。**焦段、光圈、柔光箱、色温是摄影与照片级 3D 的器材与布光**,写进卡通/线条图/水墨/像素画里只会把画面拽向照片。检查表(不是模板):主体与动作、媒介与画风、构图与取景(画幅比值走 `aspect_ratio` 字段,不写进 prompt)、色彩与影调、细节与质感、画面内文字(逐字给出,注明大小写);顺序与详略跟着媒介走,也可以加轴。用具体名词与参数,不要写「高级 / 大气 / 好看」这类空词。用户没指定画风时按交付场景选一个合理的默认,并在回复里说明。
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

**前端不碰 Remote/typert。** 浏览器半边只用同源 `fetch('/openrouter-imagen/api/...')` 调 Host 自己注册的 `webServer` 前缀路由(`kind: 'prefix'`),接口有 `config` / `test` / `models` / `generate`。这比注册一个 `@Remote` 服务面简单得多,也不需要装饰器编译。

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
git commit -m "dsh-openrouter-imagen 0.2.0"
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

删掉 profile 里的 `node_modules/dsh-openrouter-imagen` junction、从 profile 的 `cordis.patch.yml` 移除那条 `insert` 行,重启即可(若走过 CLI 安装,则用 `dsh plugin --profile desktop remove dsh-openrouter-imagen`)。设置文件里的 `openrouter-imagen` 段落可一并删除。
