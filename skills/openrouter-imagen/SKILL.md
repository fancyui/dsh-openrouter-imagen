---
name: openrouter-imagen
description: 生成、绘制、修改图片 —— 文生图与图生图，画风不限：摄影/写实、3D 渲染、插画、水彩、卡通动漫、线条图、矢量图标、扁平、像素风，或任何其他风格。改图包括换背景、换风格、改颜色、去物加物、重绘、扩图、放大、出变体。用户想要图片、照片、产品图、海报、头像、图标、贴纸、mockup、渲染图，或想改、想重做、想基于已有照片再生成一张时用本 skill。Generate and edit raster images in any visual style through the OpenRouter Image API — photography, 3D, illustration, cartoon, line art, vector, pixel art, or any other style; text-to-image and image-to-image, including restyle, relight, recolor, background replacement, object removal, inpainting and variations.
---

# 用 OpenRouter 出图

`openrouter_generate_imagen` 是唯一的出图通道。它把提示词和参考图发往 OpenRouter Image API，**按用户自己的额度真实计费**，并会离开本机。

## 你的职责只有两件事

1. **听懂用户要什么** —— 要新图还是改图、要**什么画风**、改哪里、什么必须不变。
2. **把它翻译成一条专业、具体、无歧义的提示词**，连着参考图一起交给 `openrouter_generate_imagen`。

出图由生图模型完成，**不是由你完成**。所以：

- 不要试图用文字「描述」出画面效果来代替调用工具 —— 用户要的是图。
- 不要自己复述参考图里已经拍清楚的东西（外形、颜色、logo、端子、结构）—— 那只会和图像打架。
- 不要为了凑参数而追问用户。缺的信息按下面第三步补专业默认值。
- 调用成功后回复一句话即可（卡片已经展示了参数、种子、路径和费用），不要把提示词原文或卡片内容再抄一遍。

## 第一步：判断意图

### 要生成

用户描述了一个**还不存在的画面**，并想要一张图：画、生成、来一张、做个图、出个海报、渲染一张、给我看看 XX 长什么样。

### 要修改 ← 容易被漏掉

用户**已经给了一张图**（贴在输入框、或在会话工作目录里），并要改动它：换背景、换风格、换光线、改颜色、换姿势、把 X 去掉、加上 Y、放大、多来几个版本、照着这个再画一张。

**改图同样走这个工具**，走的是图生图（`input_references`）。常见错误是回答「我无法修改图片」或改用文字描述 —— 都不对。用户贴的图会被自动暂存为参考图；图在工作目录里就传 `reference_files`。

### 不要出图

| 用户其实想 | 该走哪条路 |
| --- | --- |
| 问「这张图里是什么 / 写了什么」 | 视觉理解（直接看图回答），不要生成 |
| 裁剪、缩放、压缩、转格式、精确加水印 | 确定性图像处理：写脚本（sharp / ImageMagick / Pillow 等，先看本机有什么）。**交给生图模型会重画像素**，裁出来的尺寸也不准 |
| 要精确的排版文字、矢量 logo、图标字体 | 生成模型拼字不可靠。要么先出无字底图再后期加字，要么直接用 HTML/SVG 画 |
| 只是在讨论、评价、引用一张图 | 回答就好，不要调用 |
| 明确说了「先别画 / 只要提示词」 | 只给提示词，不调用 |

## 第二步：定媒介，然后推出它的轴

先分清两个词，全文都用这个含义：

- **槽位 = 写什么。** 一条提示词要交代的内容项，就是后面检查表的那六样：主体与动作、媒介与画风、构图与取景、色彩与影调、细节与质感、画面内文字。所有画风通用。
- **轴 = 用什么词填。** 同一个槽位，不同媒介用不同的词汇维度去填。「质感」这一个槽：摄影填材质与工艺（哑光釉 / 拉丝铝），水彩填纸纹与颜料颗粒，线稿填「无质感，只有线」。「光」这一个槽：摄影填器材与光位，水墨填浓淡与留白。

**画风不是提示词里的一句形容词 —— 它决定你用哪套轴去填槽位。** 而轴不是查出来的，是推出来的。四步：

1. **照用户说的写。** 「水彩」「赛璐璐」「丝网印刷」「蓝图」「毛毡」—— 他说什么就是什么。不要先归类再翻译成别的东西，也不要往下面那张表里硬塞。
2. **问：这种媒介靠什么被认出来？** 认得出它的那几个特征，就是你要写的轴。
3. **问：它没有什么？** 不属于它的轴一律删掉 —— 卡通没有焦段光圈，照片没有描边上色，像素画没有抗锯齿和渐变。
4. **用它自己的词汇写**，不要借别的媒介的词。

### 几个示范（**不是清单**）

下面只是举例说明第 2、3 步推出来长什么样。**表里没有的画风，你自己按上面四步推。**

| 画风 | 靠什么被认出来 | 它没有什么 |
| --- | --- | --- |
| 摄影 / 写实 | 光源与光比、焦段与景深、机位、色温 | 描边、平涂、笔触 |
| 3D 渲染 | 渲染器质感、材质（粗糙度 / 次表面）、环境光、接触阴影 | 手绘笔触（除非特意要） |
| 插画 / 水彩 / 油画 | 载体（纸 / 布）、笔触、晕染与堆叠、留白 | 精确布光参数、统一描边 |
| 卡通 / 赛璐璐 | 描边粗细与颜色、上色层数、比例夸张、表情 | 焦段、光圈、色温 |
| 线条图 / 矢量 | 线宽是否统一、颜色数、端点与拐角、留白 | 明暗、渐变、质感 |
| 平面 / 图形 | 形状语言、色块、版式与网格、负空间 | 写实质感、景深 |
| 像素画 | 像素网格尺寸、调色板数量、抖动方式、无抗锯齿 | 平滑渐变、细描边 |
| 手作 / 特殊材质 | 材质与工艺（折纸压痕、毛毡纤维、霓虹灯管） | 摄影布光（用环境光与投影代替） |

### 表里没有的画风：两个推演示范

> 用户：「国风水墨的山水」

- **媒介**：宣纸水墨。
- **靠什么被认出来**：墨色浓淡层次（焦 / 浓 / 重 / 淡 / 清）、留白与虚实、皴法笔触、散点透视而非单点透视。
- **没有什么**：没有焦段光圈、没有柔光箱色温、没有描边、没有饱和彩色。
- **写出来**：

```
Traditional Chinese ink-wash landscape on xuan paper, layered ink tones from
dense black to pale wash, dry-brush cun strokes for rock texture, vast empty
space for mist and water, scattered perspective with no vanishing point,
monochrome with a single faint vermilion seal, no outlines, no saturated color.
```

> 用户：「复古丝网印刷的演唱会海报」

- **媒介**：丝网印刷。
- **靠什么被认出来**：套色错位与叠印、限定几套专色、大色块、粗糙网点。
- **没有什么**：没有渐变过渡、没有照片级细节、没有柔和布光。
- **写出来**：

```
Retro screen-printed gig poster, three flat spot colors with deliberate
misregistration and visible overprint, bold simplified shapes, coarse halftone
dots, slight paper grain, high contrast, no gradients, no photographic detail.
```

照这两个样子推你自己的。**能在四步里说清「它靠什么被认出来 / 它没有什么」，就已经比套模板准。**

### 一条硬规则：摄影器材词只属于摄影与照片级 3D

焦段、光圈、柔光箱、色温是**器材与布光**，只在你判断媒介是摄影 / 写实或照片级 3D 渲染时才写。写进卡通、线稿、水墨、像素画里是错的，只会把画面往写实照片上拽。

**「光线」不是摄影专属，但「布光」是。** 任何画风都可以把光写成**画面内容**（晨光穿过树间、霓虹映在湿地上）；写成**器材与布光**（柔光箱尺寸、光位角度、色温）才是摄影。

### 用户没指定画风时

按交付场景选一个合理的默认，**并在回复里一句话说明你选了什么**，给他改的机会。不要为了问画风而停下。

| 场景 | 合理的默认 |
| --- | --- |
| 电商主图、产品图、人像、渲染图 | 摄影 / 写实 |
| App 图标、线稿、技术示意、流程图 | 线条图 / 矢量 |
| 贴纸、表情包、吉祥物、儿童内容 | 卡通 |
| 海报、banner、社交媒体配图 | 平面 / 图形 或 插画 |
| 概念设计、场景气氛图 | 插画 或 3D 渲染 |
| 游戏素材、复古主题 | 像素 |

用户用「画 / 插画 / 图」这类词偏向插画或图形；用「拍 / 照片 / 产品图」偏向摄影。

## 第三步：把口语翻译成提示词

**翻译四步：**

1. **定媒介并推出它的轴**（上面那一步）—— 它决定每个槽位用什么词汇。
2. **抽槽位** —— 对照检查表那六项，标出用户已经给了哪几项、哪几项还空着。
3. **补空缺** —— 用该媒介的专业默认值补上，**不要反问**。只有当一个空缺会实质改变结果、且你无法合理默认时，才用一句话问。
4. **写成一条提示词** —— 按下面的检查表，画面内文字逐字给出。

**把空词换成可执行参数：**

| 用户说的 | 你要写进去的 |
| --- | --- |
| 「高级」「大气」「好看」「精致」 | 换成具体手段：低调布光 + 大面积留白 + 单一材质台面（摄影），或克制的 4 色配色 + 大量负空间（平面） |
| 「干净一点」 | 无缝背景 + 去掉杂物（摄影），或单色背景 + 无阴影（线条图） |
| 「有质感」 | 点名材质与工艺：拉丝铝 / 哑光釉 / 磨砂玻璃（摄影）；粗纹水彩纸 / 毛毡纤维 / 折纸压痕（其他媒介） |
| 「可爱」 | 大头身比例 + 大眼睛 + 圆角线条 + 暖色（卡通），而不是直接把「cute」当唯一描述 |
| 「简约」 | 限制颜色数量 + 加大留白 + 减少细节层级；说明**删掉**了什么 |
| 「做成 XX 风格」 | 风格名 + 配色 + 该媒介典型手法（赛博朋克 → 青/品红霓虹、湿地反射、硬边轮廓光） |
| 「写点字」 | 给文字留出位置的版式 + **逐字给出文字，注明大小写与拼写** |

**永远不要**把「高级」「好看」这类词原样留在提示词里 —— 它们对模型没有约束力。

> 这张表只管 **prompt 里怎么写**。用户提到「出几张」「要竖的」这类**参数**时，不要往 prompt 里塞 —— 那是**工具调用参数**的事，见下面的参数纪律。

### 例 1 —— 摄影：产品主图

> 用户：「帮我做张咖啡杯的产品图，要高级一点的」

判断：**摄影** + 电商主图。补：材质、台面、布光、镜头。画幅不补 —— 那是 `aspect_ratio` 字段的事（见参数纪律）。

```
E-commerce hero shot of a single white ceramic coffee cup, matte glaze, empty,
standing centered on a honed grey concrete plinth. Deep charcoal seamless
backdrop falling off to black. One 1.2m softbox at 45° camera-left as key, black
flag camera-right carving a soft gradient, thin rim light from behind camera-right.
Neutral 5500K, low-key, generous negative space above the product. 100mm lens at
f/8, camera at cup mid-height.
```

调用只填 `prompt`。电商主图通常配 1:1 方画幅，但**你看不到面板当前值**：用户没点名就不要写、也不要猜，可以在回复里建议一句「面板画幅可设为 1:1」，由他决定。

### 例 2 —— 线条图：图标

> 用户：「帮我画个咖啡杯的图标，线稿那种，能放进 PPT」

判断：**线条图 / 矢量**。**不写镜头、不写布光。**

```
Minimal line-art icon of a coffee cup on a saucer with a small steam curl, drawn
in a single uniform black stroke of even weight, round caps and joins, no fill, no
shading, no gradient, no color. Centered with even margins and generous white
space on a pure white background. Flat 2D front view.
```

### 例 3 —— 卡通：贴纸

> 用户：「来个卡通柴犬贴纸，要可爱」

判断：**卡通**。画风落到线条、上色、比例上。

```
Cute cartoon sticker of a chubby Shiba Inu sitting and tilting its head, cel-shaded
with two flat tones per color, clean bold dark-brown outlines of even weight, big
round expressive eyes, tiny pink tongue, oversized head (chibi proportions), warm
cream and caramel palette. Centered, thick white sticker border.
```

「贴纸」隐含透明底，所以这里填 `background: "transparent"`，并在回复里说一句。透明底意味着**不写任何背景** —— 没有台面、地面、投影；贴纸自己的白边是贴纸的一部分，不是背景。

### 例 4 —— 插画：水彩

> 用户：「水彩风格的森林，清晨」

判断：**插画 / 绘画**。写媒介与笔触，不写器材。

```
Loose watercolor illustration of a misty pine forest at dawn, painted wet-on-wet
with visible blooms and soft bleeding edges, granulating pigment, cold-press paper
texture left visible in the unpainted areas, muted sage and pale gold palette,
soft morning light filtering between the trunks, no hard outlines. Hand-painted
picture-book feel.
```

注意这里的「光」是**画面内容**（晨光穿过树间），不是摄影布光 —— 没有柔光箱、没有色温、没有光圈。

### 例 5 —— 改图：换背景

> 用户：（贴了一张产品照）「背景换成海边的黄昏」

判断：**修改**。只写**新场景**（新背景和它自己的光线），主体一律不复述。

```
Relocate the product to a rocky coastline at golden hour. Low warm sun from
camera-left just above the horizon, long soft shadow to the right, warm rim light
along the top edge, gentle sea haze behind. Shallow depth of field, 50mm lens at
f/2.8, camera at product mid-height. 保持参考图中的产品外观不变。
```

用户贴的图已被自动暂存为参考图，所以无需 `reference_files`。若图是工作目录里的文件，填 `reference_files: ["<绝对路径>"]`。

### 例 6 —— 跨画风迁移：照片 → 线稿

> 用户：（贴了一张产品照）「把这张图变成线稿」

判断：**修改 + 跨画风**。这类请求最容易翻车，要同时说清「转成什么」和「不许保留什么」。

```
Convert the photo into clean single-weight black line art on a pure white
background. Keep the exact silhouette, proportions and mechanical details of the
product, but render them only as uniform 2px outlines: no fill, no shading, no
gradient, no photographic texture, no color. Simplify interior surfaces down to a
few essential contour lines. Flat 2D technical-illustration look.
保持参考图中的产品外观与比例不变，但整体改为线稿表现。
```

**跨画风时锁定语要跟着改。** 这里不能只写「保持参考图中的产品外观不变」—— 那和「变成线稿」互相矛盾。要写「保持外观与比例不变，**但改为线稿表现**」。

## 一条专业提示词的检查表

不分画风，一条能用的提示词对这六件事都要有交代。注意这是**检查表，不是模板**：

- **顺序和详略跟着媒介走。** 线稿的重点在描边与留白，水彩在媒介与笔触，摄影在光与镜头 —— 不要机械照抄下面这个顺序。
- **按需要加轴。** 建筑效果图要写材质与透视，像素画要写网格与调色板数量，产品包装要写印刷工艺 —— 检查表是下限，不是上限。

| 要交代的事 | 说明 |
| --- | --- |
| 主体与动作 | 是什么、什么状态、朝向、在什么环境里 |
| 媒介与画风 | 哪一类、什么技法、什么载体 |
| 构图与取景 | 取景、主体位置、留白。**画幅比值不写在这里** —— 比值走 `aspect_ratio` 字段，prompt 只用构图语言（`centered composition, generous margins`）表达取景 |
| 色彩与影调 | 配色、明度、对比、饱和度上限 |
| 细节与质感 | 细节层级，以及这种媒介特有的质感（描边 / 笔触 / 像素网格 / 材质） |
| 画面内文字 | 逐字给出，注明大小写与拼写 |

除画面内需要中文外，**用英文写提示词** —— 模型对英文的媒介与技法术语响应更稳。锁定语是发给生图模型的**指令**、不是画面内容，不受这条约束：固定写 `保持参考图中的产品外观不变`（主体不是产品时把「产品」换成实际主体：人物 / 宠物 / 场景）。

### 摄影的分镜配方

只在媒介是摄影 / 写实时才用这张表 —— 其他媒介没有「焦段」这一栏。**表里的画幅是给用户的建议**：在回复里提一句让他把面板设成表里的值，**不要写进 prompt** —— 画幅由 `aspect_ratio` 字段决定。

| 交付物 | 焦段 / 光圈 | 布光 | 机位与画幅 |
| --- | --- | --- | --- |
| 电商主图 | 85–100mm f/8 | 大柔光箱主光 + 反光板，纯色无缝背景 | 平视或略俯，产品占画面 70%，1:1 |
| 场景 / 氛围图 | 35–50mm f/2.8 | 环境光为主，一处方向性主光 | 略低机位带入环境，3:2 或 16:9 |
| 细节微距 | 90–105mm macro f/5.6 | 侧逆光勾边，突出材质纹理 | 贴近、浅景深，1:1 |
| 包装图 | 50mm f/8 | 均匀双灯，消除硬阴影 | 三分之四侧，1:1 |
| 人像 | 85mm f/1.8 | 柔光箱 45° + 轮廓光 | 平视，2:3 或 1:1 |
| 电影感场景 | 24–35mm f/2 | 戏剧性单光源，强明暗对比 | 低机位，16:9 或 2.39:1 |

## 参考图（image-to-image）

| 给法 | 何时用 |
| --- | --- |
| 用户在输入框上方贴了图 | 什么都不用做 —— 插件自动作为参考图带上 |
| `reference_files` | 图已经在会话工作目录里。填**绝对路径**；目录外的路径会被拒绝，因为字节要上传给第三方 |
| `reference_images` | 只有 http(s) 链接或 data URL 时才用 |

最多 4 张。

**核心规则：只描述要改的，其余一句话锁住。**

- 主体外观**不要复述**，写一句 `保持参考图中的产品外观不变` 即可（主体不是产品时换词：人物 / 宠物 / 场景）。
- 用户明确要改的部分（换背景、换姿势、换装、换光线、换画风）才写进提示词。
- **改画风时锁定语要补一句**「但改为 XX 表现」，否则和新的画风要求打架（见例 6）。
- 带参考图的提示词只写**这次要改的部分**：新背景、新光线、新画风、构图，**加上那句锁定语** —— 主体外观一律不复述。

> 如果别的插件把附图先转成了**文字描述**再喂给你，那段描述**不要**抄进提示词 —— 它是对画面的复述，抄进去就是冲突源。

## 迭代与复现

- **`seed` 是唯一的复现手段。** 面板种子留空时插件抽一个随机数并**回报**在结果的 `seed` 里（卡片上也显示）。用户说「再来一张一样的」就把上次的 `seed` 原样填回去，提示词不动。
- 想要「同一张的变体」：固定上一次的 `seed`，只改提示词里的一处，并说清改了什么（「主光从左改到右」「改成卡通」）。
- **用户嫌某张不对，先分清是哪种不对，再选动作：**

| 用户嫌什么 | 问题在哪 | 动作 |
| --- | --- | --- |
| 内容不对：东西错了、画错了、风格错了 | 提示词没说清 | **改提示词**再调。原样重发只会得到同样的错 |
| 提示词没问题，单纯这张不好看 | 随机运气 | **原样再调一次** —— 面板种子留空时插件每次现抽新随机数。但若种子是固定的（复现场景），再调还是同一张：那就改提示词，或让用户清空种子 |

- **出几张是用户的事**，不是你的判断 —— 见下面的参数纪律。

## 参数纪律：默认只填 prompt

调用这个工具时你能填两样东西 —— **两样都是工具调用的参数**，区别只在填不填：

| | 位置 | 说明 |
| --- | --- | --- |
| **`prompt`** | 工具调用的 `prompt` 参数 | **必填，这是你的活** —— 画面描述 |
| 几个可选参数 | 工具调用的同名参数（`model`、`count`、`resolution`、`aspect_ratio`、`quality`、`background`、`seed`） | **覆盖面板**，只在这一次生效 |

**面板的值会自己进请求，不用你写。** 那些可选参数留空，就等于用面板的值。所以规则只有一条：

> **默认动作：只填 `prompt`，其余全部留空。**
> 用户**在这条消息里点名**了某个参数，才把那一个填上。

**「留空」是正确行为，不是遗漏。** 面板里的值由插件直接填进发往生图模型的请求 —— 你既不需要抄一遍，也不需要知道它是什么。

不要自己判断「这次适合出几张」「这个主题配方形更好看」「提高画质会更清楚」「竖版更适合手机」—— 那是用户的设置，不是你的决定。想建议可以在回复里说一句；但不要动手改。

### 谁管哪个参数

| API 字段 | 归谁管 | 你能填的工具参数 | 你什么时候填 |
| --- | --- | --- | --- |
| `prompt` | **你** | `prompt` | 每次都填 |
| `model` | 设置页「模型 ID」 | `model` | 用户点名模型时 |
| `n` | 「图像」面板「数量」 | `count` | 用户点名张数时（1–10） |
| `resolution` | 「图像」面板「分辨率」 | `resolution` | 用户点名分辨率时 |
| `aspect_ratio` | 「图像」面板「宽高比」 | `aspect_ratio` | 用户点名画幅时 |
| `quality` | 「图像」面板「画质」 | `quality` | 用户点名画质时 |
| `background` | 「图像」面板「背景」 | `background` | 用户点名背景时 |
| `seed` | 「图像」面板「种子」 | `seed` | 用户要复现 / 固定种子时（seed **总是提交**：面板留空时插件自己抽随机数） |
| `input_references` | 你，或用户在输入框贴的图 | `reference_images`、`reference_files` | 需要图生图时（两者归并成这**一个**字段） |
| `output_format` | 「图像」面板「格式」 | **填不了** | —— |
| `provider` | 设置页「Provider 排序」 | **填不了** | ——（只影响 OpenRouter 挑哪家上游，不影响画面） |
| `saveDir` | 设置页 | **填不了** | —— |
| `extraJson` 里的字段 | `settings.yaml` | **填不了** | ——（原样并入请求体，但不能覆盖 `model` / `prompt` / `input_references`） |

**这是完整的清单。** 不在表里的字段 API 一概收不到 —— 想让画面里出现什么，只能写进 `prompt`。标「填不了」的那几个连参数都没有，填了会被工具拒绝。

### 什么叫「点名」

| 用户说 | 你填什么 |
| --- | --- |
| 「画只猫」 | 只填 `prompt` |
| 「画只猫，要竖的」 | `prompt` + `aspect_ratio: "9:16"` |
| 「出三张猫」 | `prompt` + `count: 3` |
| 「出一张猫」 | 只填 `prompt` —— 「一张」就是默认，`count` 不用填 |
| 「用 2K 画张猫，要透明底」 | `prompt` + `resolution: "2K"` + `background: "transparent"` |
| 「用上次那个种子再来一张」 | `prompt` + `seed: <上次那个>` |
| 「画只猫，全身照」 | 只填 `prompt` ——「全身照」是**取景**，写进 prompt |

**点名只认最新一条用户消息。** 可选参数只在**这一次**调用生效，面板的值不会因为你上次填过而改变 —— 上一条消息说过「要竖的」，这一条只说「画只猫」，就只填 `prompt`。要延续，用户得再说一次，或者自己去调面板。

**唯一例外**：交付物的名字**定义里就带着**的属性 —— 「贴纸」不透明底就不叫贴纸（→ 填 `background: "transparent"`）、「图标」默认方画幅（→ 填 `aspect_ratio: "1:1"`）。判据：**去掉这个属性，这个词就不成立了**，才算「自带」；「海报用什么比例好看」是偏好，不算 —— 在回复里建议一句，让他定。

面板里没有合适的画幅时（比如用户要超宽横幅），**在回复里提一句建议**，不要自己覆盖他的设置。

### 面板参数的值不要写进 prompt

它们是 API 字段，由插件单独送达 —— 写进 prompt 是重复。而且**你看不到面板的当前值**（面板在输入框上方，不在你的上下文里），猜一个写进去只会和它打架。

- ❌ 不要写「2K」「16:9」「high quality」「seed 12345」「transparent background」这类**字段值**。
- ✅ 只把**这条对话里提到过的**参数写进 prompt，而且用**画面语言**，不是复述数值。

| 对话里提到 | 填工具参数 | prompt 里怎么呼应 |
| --- | --- | --- |
| 「要 9:16」「竖构图」 | `aspect_ratio: "9:16"` | `vertical composition, tall framing` |
| 「要横的」「16:9」 | `aspect_ratio: "16:9"` | `wide horizontal composition, horizon line` |
| 「要方图」 | `aspect_ratio: "1:1"` | `centered composition, even margins` |
| 「要透明底」 | `background: "transparent"` | **不要描述背景** —— 别写台面、地面、投影、环境 |
| 分辨率 / 画质 / 数量 / 种子 / 格式 | 对应的工具参数 | **不要写进 prompt** —— 这些不是画面内容 |

数值本身对生图模型没有意义：「9:16」不会让它排出竖幅画面，`vertical composition, tall framing` 才会。**只有会改变画面本身的参数（画幅、背景）值得在 prompt 里呼应，其余一律靠 API 字段。**

不知道面板画幅时怎么办：**按用户这句话的意图写构图**，不要猜他的面板。用户没提画幅，就写一个与主体相称的构图，让面板去决定最终裁切。

## 结果怎么用

- 图以**附件**回到对话直接可见，同时落盘到会话工作目录的 `saveDir`（默认 `generated-images`）；结果里的 `保存目录` / `文件` 就是路径。
- 卡片已展示模型、参数、种子、路径和费用 —— **回复里不要复述**，一句话说明结果即可。
- 文件在会话工作目录内，后续 `read` / `move` / `edit` 都够得着。要嵌进 `.docx` / `.pptx` / 网页 / Markdown 时，用结果里的 `文件` 路径，并且用**工作目录相对路径**（项目搬走后仍有效）。
- 放进文档时配合对应技能（`docx` / `pptx` / `univer-*` 等），不要自己拼 zip。

## 排错

| 现象 | 原因与做法 |
| --- | --- |
| `尚未设置 OpenRouter API Key` | 让用户到 设置 → 图像生成 填 Key（`sk-or-v1-` 开头），或点「测试 Key」 |
| `OpenRouter 401` | Key 无效或过期；服务端原文会带在错误里，照着说 |
| `无法连接 OpenRouter` | 网络/代理问题。插件走 `HTTPS_PROXY`/`HTTP_PROXY`；确认代理在跑 |
| `生成请求超时` | 上限 10 分钟。大分辨率或多张容易超时，降 `resolution` 或 `count` |
| `参考图必须位于会话工作目录内` | 先把图复制进项目，或改用 `reference_images` 传 http(s) 链接 |
| `附加参数不能覆盖 model/prompt/input_references` | `extraJson` 是设置页字段，不是工具参数；不要用它换模型 |
| 图里出现错字 | 提示词里逐字给出文字并注明大小写；生成模型拼写能力有限，必要时后期加字 |
| **要卡通却出了照片** | 提示词里混进了摄影器材词（焦段/光圈/柔光箱/色温）—— 删掉，改写成线条、上色、比例 |
| **要线稿却还是照片** | 只写了「line art」但没禁止写实质感 —— 补 `no shading, no gradient, no photographic texture` |
| 改图后主体变形了 | 提示词里多半复述了主体外观 —— 删掉那些描述，只留「保持参考图中的产品外观不变」 |

## 边界

- 只在用户确实要图时调用；这是**付费**接口。
- 不生成真人肖像、名人形象、侵权商标等伪造内容；用户明确要求时先说明风险。
- 提示词与参考图会发往 OpenRouter —— 涉及未公开产品、客户资料、个人信息时先提醒用户。