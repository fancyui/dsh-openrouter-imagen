# `gpt-image-2-style-library` 读库守卫

这个目录里的两个文件用于给**插件仓库之外**的一个第三方 skill 打补丁,它们不属于插件本身,也不进 npm 包(`package.json` 的 `files` 白名单只含 `lib`/`skills`/`cordis.patch.yml`/`README.md`/`LICENSE`)。

## 补的是什么

被修的 skill 装在用户目录:`~/.agents/skills/gpt-image-2-style-library/`(上游 [awesome-gpt-image-2](https://github.com/freestylefly/awesome-gpt-image-2),MIT)。

它的 `SKILL.md` 要求:「Read `references/style-library.md` **before** choosing a template or style」,还有「Prefer the reference over memory」。**但实测这条拦不住**:同一台机器、同一个 skill、同一个模型,第一轮真的读了那份 27 KB 的参考库,第二轮直接跳过,然后照样引用模板名、`- ID:`、`- Example cases:`。

原因是结构问题,不是措辞不够凶:

| 模型看到 | 它的结论 |
| --- | --- |
| skill 描述里写着有 categories / tags / pitfalls / example cases | 「我知道库里有啥」 |
| `SKILL.md` 只有 57 行,读完了 | 「这个 skill 我掌握了」 |
| 「去读 references/…」放在 `## Reference` 小节 | 这是一句**背景说明** |
| Workflow 第 3 条直接开始匹配 | **可以动手了**,中间没有关卡 |

所以那条指令被归类成「背景」而不是「待办」。补丁把它变成关卡,三处配合:

| # | 位置 | 加了什么 | 作用 |
| --- | --- | --- | --- |
| 1 | `## Reference` 第 1 条 | 「**Reading this SKILL.md is not reading the library.**」+ 判据(候选模板的 ID/Category/Styles/Scenes/Tags/Example cases 不在上下文里 = 没读过) | 给「记忆够不够用」一个可判定的标准 |
| 2 | Workflow 新增第 3 步 | 「**Gate: you cannot cite what you have not read.**」+ 要求能逐字引出 `- Category:` 行,否则先读 | 卡在「开始匹配」那一刻 |
| 3 | `## Output Defaults` 末尾 | 输出提示词前的最后自检:没读、或不能逐字引出一段模板块,就现在去读 | 兜底 |

三处都用**可验证的动作**(「能不能逐字引出一行」),而不是「记得要读」这种态度要求 —— 后者对模型没有约束力,这正是它失败的原因。Workflow 原第 3–6 步顺延为 4–7 步。

## 怎么用

```powershell
# 默认目标:~/.agents/skills/gpt-image-2-style-library/SKILL.md
pwsh -File docs/reapply-style-library-guard.ps1

# 换目标(测试或安装到别处时)
pwsh -File docs/reapply-style-library-guard.ps1 -Target <path-to-SKILL.md>
```

脚本是**幂等**的:已经打过补丁就打印 `OK guard already present` 并退出 0,不会重复施加。

也可以自己上补丁(patch 头是 `a/SKILL.md` / `b/SKILL.md`,故 `-p1`):

```powershell
git -C ~/.agents/skills/gpt-image-2-style-library apply -p1 <repo>/docs/style-library-skill-guard.patch
```

## 验证过的行为

四个场景都实跑过(在临时目录里,不碰真实 skill):

| 场景 | 期望 | 实测 |
| --- | --- | --- |
| 干净原文 | 施加成功,结果 SHA256 与基准一致 | ✅ 一致 |
| 已打过补丁 | 不动,退出 0 | ✅ |
| hunk 上下文被上游改坏 | 拒绝施加,**文件一个字节不动**,退出 1 并给出原因 | ✅ |
| 上游只在**末尾**追加内容 | 施加成功(hunk 只覆盖那几处) | ✅ 但见下 |

备份写在**系统临时目录**,成功后删除 —— 不会在用户的 skills 目录里堆 `SKILL.md.bak-*`。

## 已知限制

- **上游一重新生成就会静默丢失。** 跑一次 `npm run generate:style-skill` 或重装 skill,这三处就被覆盖,而且没有任何提示。发现行为退化时先重跑本脚本。
- **末尾追加类改动会照常施加。** 补丁的 hunk 只覆盖它引用的那几处;如果上游在别处追加/修改了互不重叠的内容,补丁仍然成功。这通常没问题(守卫生效),但**不能把它当成「文件未被上游改过」的证明**。
- **hunk 上下文被改坏时无法自动合并。** 那种情况只能按上表三处手工移植。
- 长期做法是把这三处提给上游 —— 它对所有用这个 skill 的人都有用,提上去就不必再维护本地补丁了。

## 复现补丁

补丁由 `git diff --no-index` 生成,前缀为空、两侧文件名都是 `SKILL.md`,所以头部是可读的相对路径:

```powershell
git -C <tmp> diff --no-index --no-color --src-prefix= --dst-prefix= --output=out.patch a/SKILL.md b/SKILL.md
```
