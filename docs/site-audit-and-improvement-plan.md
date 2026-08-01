# QZ Site 问题审计与近期改造建议

> **实施状态（2026-07-29）**
>
> 本文记录的是改造前审计基线，正文中的 `BUG-*`、`SEC-*`、`ENG-*`、`MANUAL-002` 和适合当前阶段的产品建议均已实施，包括 Todo/Idea 转博客草稿。2026-07-29 的补充收尾还完成了公开系统文案国际化、右下角后台入口、Git/镜像源码指纹、自动冒烟、版本化 cron、证书安全安装脚本和灾备文档。文中明确列为“暂不建议实施”或达到内容规模后再做的分页、RSS、项目详情 CMS 等事项仍按原决策不实施。
>
> **上线回归补充（2026-08-01）**：发现并修复 `BUG-022`。可读 slug 改造允许中文进入 slug，但详情路由未解码百分号编码后的参数，导致中文 slug 文章能在列表和后台显示、点击却进入 404。现已统一解码路由参数并增加回归测试，不修改现有文章数据。
>
> 同日上线回归发现：已登录访问 `/admin` 会返回 500。原因是公开端与后台共用的 `ThemeToggle` 在国际化改造后直接调用 `useTranslations()`，而 `/admin` 不在 `NextIntlClientProvider` 内。补丁已将翻译文案改为由公开端调用方传入，并增加无国际化 Provider 的服务端渲染测试。此前冒烟只覆盖未登录跳转，不能代表已登录后台可渲染；后续认证或共享布局改动必须补做完整登录回归。
>
> 当前仅保留所有权或云账号边界内的外部事项：`MANUAL-001` 后台密码轮换、ICP备案、异地云盘快照和最后移除个人 SSH 公钥。`postgres/nginx` TCR 副本经复核当前没有必要创建。当前系统结构以 [`architecture.md`](architecture.md) 为准，后续改动方法以 [`development-guide.md`](development-guide.md) 为准，最新部署、备份、恢复和 Gitee Agent 操作以 [`operations.md`](operations.md) 与 [`disaster-recovery.md`](disaster-recovery.md) 为准。

## 1. 文档目的

本文档用于交接给后续 Agent，目标是：

1. 说明当前网站已经确认的错误、风险和体验问题。
2. 给出尽量小步、可验证的修改方案。
3. 收录适合当前阶段的产品改造建议。
4. 明确暂时不建议实施的方向，避免范围失控。

本文档不是完整的安全渗透测试或压力测试报告。结论来自：

- 2026-07-28 对线上站点的桌面端、移动端和登录后后台实测。
- 对 `app/`、`components/`、`lib/`、`prisma/`、Docker、Nginx 和 CI/CD 配置的静态审查。
- `npm.cmd run lint`、`npm.cmd run build`、`npx.cmd prisma validate` 和 `npm.cmd audit` 的本地验证。
- 对 14 个 API Route 的方法与认证边界复核。
- 对全部 128 个 Git 提交的敏感文件名、常见凭据特征和仓库对象完整性复核。
- 对 Compose 配置、Prisma Schema 与初始 migration 的语义一致性复核。

## 2. 当前基线与修改约束

### 2.1 基线

- 分支：`main`
- 审计时提交：`07c8082`
- Next.js：`16.2.10`
- React：`19.2.4`
- Prisma CLI / Client 实际安装版本：`7.9.0`
- 生产构建：通过
- Prisma Schema 校验：通过
- ESLint：0 个错误，7 个警告
- 自动化测试：未发现测试文件，`package.json` 中没有 `test` 脚本
- Docker Compose 配置解析：通过
- Prisma Schema 与 `0_init` migration：除 Prisma 自动生成的 `public` Schema 初始化语句外，20 条业务 SQL 语义一致
- Git 仓库完整性：`git fsck --full` 通过
- 未登录边界实测：`/admin` 重定向，Todo 写接口返回 401，不存在的文章返回 404

### 2.2 必须保留的用户改动

审计时工作区已有以下未提交修改：

```text
M app/globals.css
```

后续 Agent 可以在理解现有差异后继续编辑该文件，但不得通过 `git checkout`、`git reset`、覆盖整文件等方式丢弃用户修改。

### 2.3 实施原则

1. 先修正确性、数据安全和移动端可用性，再做视觉升级。
2. 不在同一批修改中重写整个设计系统、后台或数据库架构。
3. 涉及 Prisma Schema 时必须生成正式 migration，不能只执行 `db push`。
4. 线上数据修改前先备份 PostgreSQL 和 `data/uploads`。
5. 每一批修改完成后至少执行：

```bash
npm.cmd run lint
npm.cmd run build
npx.cmd prisma validate
```

### 2.4 审计完整性与边界

**已知客观事实**

1. 当前仓库共有 114 个跟踪文件，其中 105 个业务源码、配置和部署文件已纳入静态扫描。
2. 14 个 API Route 中，所有管理写操作都有 Session 校验；公开 GET 仅限项目列表、白名单设置和登录状态等预期接口。
3. Git 全历史未发现真实私钥、常见云密钥或 API Token 特征。历史部署文档出现过私钥头和环境变量示例，但内容是占位文本。
4. `.env`、本地 Compose override、数据库目录、上传文件和证书私钥均被 Git 忽略；`.dockerignore` 也排除了 `.env*`。

**结论边界**

1. 不能声称“绝对没有任何未知问题”。本次没有执行破坏性写入、生产数据库恢复、压力测试或完整渗透测试。
2. 本地 Docker daemon 未运行，因此没有完成最终镜像构建、容器用户身份和容器内健康检查实测。
3. 没有读取或输出本地 `.env` 和线上数据库内容；这避免了扩大敏感信息暴露，但也意味着生产环境变量质量与备份可恢复性需要人工核验。
4. 在当前代码规模下，功能、认证、数据模型、依赖、容器、迁移、CI/CD、响应式和可访问性等主要风险面已经覆盖，可以进入分批修改，不需要继续无限扩大审计范围。

## 3. 总体判断

| 目标 | 当前状态 | 近期目标 | 是否需要重构 |
|---|---|---|---|
| 博客与知识沉淀 | 基础闭环完整，长文阅读较好 | 修复目录、日期、自动保存和检索体验 | 不需要整体重构 |
| Idea / Todo | 可快速添加，但内容结构和移动端不足 | 先把现有 Todo 做成可靠的轻量 Inbox | 暂不拆分新系统 |
| 求职展示 | 有干净外观，但个人身份与项目证据不足 | 改首页文案、联系方式和项目卡片 | 不需要另建作品集 |
| 工程与部署 | Docker、数据库、上传持久化已具备 | 修复迁移、环境变量和依赖风险 | 不需要更换技术栈 |

### 3.1 最终问题清单

**原始审计最终收录 34 个可执行条目，2026-08-01 上线回归后新增 `BUG-022`，当前共 35 个**，分类如下：

| 分类 | 编号范围 | 数量 | 处理原则 |
|---|---|---:|---|
| 第一优先级缺陷 | `BUG-001`–`BUG-006`、`BUG-019` | 7 | 先修正确性、数据与初始化风险 |
| 核心体验缺陷 | `BUG-007`–`BUG-018`、`BUG-020`–`BUG-022` | 15 | 分批修复，不重写后台 |
| 安全项 | `SEC-001`–`SEC-006` | 6 | 先做低风险、可验证的加固 |
| 工程项 | `ENG-001`–`ENG-005` | 5 | 提高构建和部署可预期性 |
| 人工核验项 | `MANUAL-001`–`MANUAL-002` | 2 | 需要站点所有者或服务器权限 |

**最终判断**：不需要在下一步前再做一轮同范围全盘扫描。后续 Agent 可以按第 7 节开始修改，但每批仍需针对改动范围做回归；本文档不把“未做渗透测试”包装成“绝对不存在未知问题”。

## 4. 确认缺陷与修改方案

### 4.1 P0：优先修复

#### BUG-001：关于页邮箱字段不一致

**现象**

后台设置页已经保存邮箱，但公开关于页只显示 GitHub，不显示邮箱。

**原因**

- `components/admin/SettingsForm.tsx` 保存键名 `email`。
- `app/[locale]/about/page.tsx` 查询了 `email`，但渲染时读取 `map.about_email`。
- `prisma/seed.ts` 又初始化了 `about_email`。

当前存在 `email` 与 `about_email` 两套键名。

**修改建议**

统一使用 `email`：

1. `app/[locale]/about/page.tsx` 改为读取 `map.email`。
2. `prisma/seed.ts` 改为初始化 `email`。
3. 保留 `app/api/settings/route.ts` 当前公开白名单中的 `email`。
4. 增加一次性数据兼容：仅当 `email` 为空且旧 `about_email` 有值时，将旧值复制到 `email`。
5. 确认数据迁移完成后再考虑删除旧键，不要直接删除线上数据。

**验收标准**

- 后台填写邮箱并保存后，`/zh/about` 显示 `mailto:` 链接。
- 邮箱为空时不渲染空链接。
- 旧数据不会因为键名统一而丢失。

#### BUG-002：Markdown 新文章无法生成目录

**现象**

线上长文包含多个标题，但文章右侧没有目录。

**原因**

- `components/admin/PostEditor.tsx` 的新编辑器通过 `markdownUpdated` 保存 Markdown。
- `app/[locale]/blog/[slug]/page.tsx` 的 `extractHeadings()` 只尝试 `JSON.parse(content)`，仅支持旧 Tiptap JSON。

**修改建议**

1. 将“旧 Tiptap JSON 转 Markdown”的逻辑抽到共享模块，例如 `lib/content.ts`。
2. 目录提取与正文渲染都基于同一份标准化 Markdown。
3. 使用 Markdown AST 解析标题，不建议只写简单正则，因为需要忽略代码块中的 `#`。
4. 标题 ID 与目录链接必须使用同一个 slug 生成器。
5. 处理重复标题，生成 `title`、`title-1`、`title-2`，避免重复 `id`。
6. 保留旧文章兼容。
7. 为旧 Tiptap JSON 中的链接、组合格式和有序列表增加转换测试，避免迁移时丢格式。

**验收标准**

- Markdown 的二、三、四级标题均出现在目录中。
- 点击目录能滚动到正确标题。
- 重复标题不会生成重复 DOM ID。
- 旧 Tiptap JSON 文章仍能正常显示。

#### BUG-003：“最新文章”排序与显示日期不一致

**现象**

线上“最新文章”中，显示为 6 月的文章可能排在 7 月文章前面。

**原因**

`lib/posts.ts` 和 `app/[locale]/blog/page.tsx` 按 `createdAt` 排序，但卡片显示 `publishedAt`。

**修改建议**

已发布文章统一按以下顺序排序：

```ts
orderBy: [
  { publishedAt: "desc" },
  { createdAt: "desc" },
]
```

后台草稿列表可以继续按 `updatedAt` 或 `createdAt` 排序，但列名要写清楚。

**验收标准**

- 首页和博客列表的可见日期严格按从新到旧排列。
- 相同发布时间使用 `createdAt` 稳定排序。

#### BUG-004：发布时间存在时区偏移和发布状态逻辑不一致

**现象**

`datetime-local` 提交的是不带时区的字符串。浏览器输入代表用户本地时间，但 API 在服务器容器中执行 `new Date(publishedAt)`，可能按 UTC 解释，导致中国时区偏移 8 小时。

此外：

- 新建并直接发布、编辑草稿后发布，对空发布时间的处理不一致。
- 编辑草稿发布时，前端总会发送 `publishedAt: null`，API 会保存为 `null`，而不是当前时间。
- `PUT` 把状态和时间分别更新，没有明确“首次发布”“重新发布”“退回草稿”的规则。

**修改建议**

1. 前端在提交前将本地输入转换为 ISO 时间：

```ts
publishedAt ? new Date(publishedAt).toISOString() : null
```

2. API 验证日期是否有效，非法日期返回 400。
3. 明确规则：
   - 保存草稿：`publishedAt = null`。
   - 草稿首次发布且未指定时间：使用服务器当前时间。
   - 已发布文章更新且未改时间：保留原 `publishedAt`。
   - 用户明确选择时间：使用经验证的 ISO 时间。
4. 更新时间时先读取现有文章状态，不能只按请求字段机械覆盖。

**验收标准**

- 在 Asia/Shanghai 输入的时间保存后重新打开，显示值不偏移。
- 接近午夜的发布时间不会显示到错误日期。
- 草稿首次发布会获得非空 `publishedAt`。
- 更新已发布文章不会意外重置原发布时间。

#### BUG-005：移动端 Todo 页面不可用

**现象**

390px 手机视口下，左侧固定分区栏占据大部分宽度，右侧 Todo 被压成极窄列，长文本逐字换行。

**原因**

`components/admin/TodoList.tsx` 使用：

```tsx
<div className="flex gap-6">
<div className="w-48 shrink-0">
<div className="flex-1">
```

没有移动端布局分支。

**修改建议**

1. 外层改为 `flex-col lg:flex-row`。
2. 分区栏改为 `w-full lg:w-48`。
3. 添加区域改为 `flex-col sm:flex-row`。
4. Todo 文本容器使用 `min-w-0 break-words`。
5. 删除按钮在触摸设备上始终可见，不能只依赖 `group-hover`。
6. 在 390px、768px、1440px 三种宽度验证。

**验收标准**

- 390px 下 Todo 标题保持正常句子宽度。
- 输入框、分区选择和添加按钮不溢出。
- 手机端可以完成新增、勾选和删除。

#### BUG-006：Docker 自动 baseline 可能掩盖迁移失败

**现象**

`Dockerfile` 启动命令在 `prisma migrate deploy` 失败后自动执行：

```text
prisma migrate resolve --applied 0_init
```

**风险**

迁移失败不一定是“已有数据库需要 baseline”，也可能是 Schema 漂移、权限错误或部分执行失败。自动标记已应用可能让数据库处于“迁移记录显示成功，但实际表结构不完整”的状态。

**修改建议**

1. 删除生产启动命令中的自动 `migrate resolve` 回退。
2. 容器启动只执行 `prisma migrate deploy`，失败则退出并保留日志。
3. 旧数据库 baseline 应作为一次性人工运维步骤，并记录在部署文档中。
4. 修改前先确认线上 `_prisma_migrations` 与实际 Schema 状态。

**验收标准**

- 正常数据库可成功执行 `migrate deploy`。
- 人为制造错误迁移时，容器明确失败，不能自动标记成功。
- README 记录旧库 baseline 的一次性操作。

#### BUG-019：Prisma Seed 链路会失效、覆盖密码并吞掉失败状态

**现象**

当前 Seed 链路同时存在三处问题：

1. 项目使用 Prisma 7，但 `prisma.config.ts` 的 `migrations` 中没有配置 `seed` 命令。README 要求执行的 `npx prisma db seed` 因此没有完整配置；`package.json` 中旧式的 `prisma.seed` 不能作为 Prisma 7 的唯一配置来源。
2. `prisma/seed.ts` 对已有 `admin` 用户执行 `update: { passwordHash: hash }`。重复运行 Seed 会把现有后台密码改回当次的 `SEED_PASSWORD`。
3. `main().catch(console.error)` 只打印错误，没有设置非零退出码。数据库连接或写入失败时，CI 或操作者可能仍看到成功退出。

Prisma 7 要求在 `prisma.config.ts` 的 `migrations.seed` 中声明命令，且官方示例会在失败时以非零状态退出。（来源：[Prisma 官方 Seeding 文档](https://www.prisma.io/docs/orm/prisma-migrate/workflows/seeding)）

**修改建议**

1. 在 `prisma.config.ts` 中增加 `seed: "tsx prisma/seed.ts"`。
2. 删除 `package.json` 中重复、过时的 `prisma.seed` 配置，只保留 `db:seed` 脚本作为便捷入口。
3. 已有管理员存在时不更新 `passwordHash`；仅在首次创建管理员时读取并校验 `SEED_PASSWORD`。
4. Seed 失败时设置 `process.exitCode = 1`，并在退出前可靠断开 Prisma。
5. README 统一写明 `npx prisma db seed` 和 `npm run db:seed` 的用途，明确重复执行不会改密码。
6. 先在临时数据库验证，不要直接用生产数据库试错。

**验收标准**

- `npx prisma db seed` 能调用项目 Seed 脚本。
- 首次执行能创建管理员和默认数据。
- 第二次执行不会改变管理员密码 Hash。
- 人为使用错误数据库地址时，命令以非零状态退出。

#### MANUAL-001：后台密码需要人工更换

当前后台密码已在审计对话中传输过，应视为需要轮换。

**处理方式**

1. 使用后台设置页更换为独立、随机、足够长的密码。
2. 不把新密码写入仓库、文档、聊天记录或 CI 日志。
3. 同时轮换生产 `SESSION_SECRET` 并重启 Web 容器，使此前签发的所有 Session Cookie 失效。
4. 重启后确认原 Session 已失效、旧密码无法登录、新密码可以登录。

该项需要站点所有者执行，不应由 Agent 猜测或生成并保存密码。

### 4.2 P1：核心体验与可靠性

#### BUG-007：后台部分写请求失败时仍表现为成功

**现象**

`TodoList.tsx` 中多个操作直接 `await fetch()`，没有检查 `res.ok`：

- 新增后无论成功失败都会清空输入。
- 勾选、删除、创建分区、重命名、删除分区都会直接刷新。
- 网络错误没有可见反馈。

类似问题也存在于 Blog 分区管理、项目列表删除和注销流程：部分请求没有检查失败状态，或者失败后仍继续跳转。

**修改建议**

1. 所有写操作检查 `res.ok`。
2. 仅成功后清空输入或刷新数据。
3. 失败时显示内联错误或统一 Toast。
4. `catch` 网络错误。
5. 避免在错误时静默吞掉用户输入。

**验收标准**

- 模拟 API 500 时，输入内容仍保留。
- 页面显示可理解的失败信息。
- 成功后状态与数据库一致。

#### BUG-008：Todo 删除无确认且无法恢复

**现象**

Todo 删除按钮直接调用 DELETE，没有确认、撤销或归档。对于已经被用于记录长 Idea 的条目，误删成本较高。

**修改建议**

近期采用最小方案：

1. 删除前显示确认对话框。
2. 删除失败显示错误。
3. 暂不实现复杂回收站。

后续如果误删频繁，再考虑软删除或归档。

**验收标准**

- 单击删除不会立即永久删除。
- 取消确认时数据不变。

#### BUG-009：移动端 Blog/项目后台列表缺少响应式处理

**现象**

- `components/admin/PostsList.tsx` 同样使用固定 `w-48` 分区栏。
- 文章表格与项目表格有多个固定宽度列。
- 表格外层使用 `overflow-hidden`，手机端可能裁切而不是滚动。
- 分区编辑和删除按钮主要依赖 Hover，触摸设备难以发现。

**修改建议**

1. 分区栏使用与 Todo 相同的 `flex-col lg:flex-row` 方案。
2. 表格外层改为 `overflow-x-auto`，表格设置合理 `min-w-*`。
3. 更好的后续方案是移动端使用列表卡片，但第一阶段可先用横向滚动。
4. 触摸端操作按钮保持可见。

**验收标准**

- 390px 下文章和项目操作可访问。
- 不出现被 `overflow-hidden` 裁掉的列。

#### BUG-010：API 输入校验不足，错误状态码不准确

**现象**

多个 API 只进行少量手工校验：

- Todo 标题可以传入非字符串。
- PATCH 可传入非法状态、优先级或日期。
- Category 类型、Project URL、Tags 内容缺少严格校验。
- Settings PUT 接受任意键名。
- Post PUT 允许空标题。
- Prisma 的记录不存在、唯一键冲突、外键错误通常会落入通用 500。

**修改建议**

1. 为 Post、Todo、Category、Project、Settings 建立集中 Schema 校验。
2. 可以使用一个轻量验证库，也可以建立共享手工校验函数；不要在每个路由复制不同规则。
3. 至少校验：
   - 字符串类型、`trim()`、最大长度。
   - Enum 值。
   - URL 协议只允许 `http` / `https`。
   - Tags 为字符串数组，并限制数量与单项长度。
   - 日期有效性。
   - Settings 允许更新的键白名单。
   - 同一类型下重复分类名称的处理规则。
4. 在统一错误处理器中映射常见 Prisma 错误：
   - 不存在：404。
   - 唯一冲突：409。
   - 非法外键：400。

**验收标准**

- 非法请求稳定返回 400，而不是 500。
- 删除不存在资源返回 404。
- Settings 无法写入未允许的任意键。

#### BUG-011：后台明暗主题表现不稳定

**现象**

同一浏览器、同一深色偏好下，线上审计中 `/admin/posts` 曾以亮色渲染，而相邻后台页面为深色。主题 class 由根布局内联脚本与公开端 `ThemeToggle` 分别维护，没有统一 Provider。

**修改建议**

1. 将主题状态集中到一个根级 Theme Provider。
2. 本地存储、系统偏好和 `<html class="dark">` 只由一个模块管理。
3. 后台也提供主题切换入口，或明确只跟随系统。
4. 保留首屏防闪烁脚本，但不要与客户端状态相互移除 class。

**验收标准**

- 公开端与后台刷新后主题一致。
- 页面切换不闪白。
- `theme=dark` / `theme=light` 均可稳定恢复。

#### BUG-012：Milkdown 深色编辑器占位文字对比度不足

**现象**

“写新文章”页面的编辑器在深色模式下几乎看不见默认 `Please enter...` 占位文字，Crepe 部分样式没有完全使用站点颜色变量。

**修改建议**

1. 检查实际占位元素或伪元素的 class。
2. 为深浅主题分别设置可读的占位色。
3. 将英文占位文案改成中文。
4. 验证正文、工具栏、代码块、菜单和选择状态的对比度。

**验收标准**

- 深浅主题中占位文字、正文和工具栏均清晰可见。

#### BUG-013：英文切换不是完整国际化

**现象**

- `/en` 只翻译导航和固定文案。
- 数据库文章、项目、分类和设置没有 locale 字段，内容仍可能是中文。
- 根 `<html lang>` 固定为 `zh-CN`。
- 多处空状态、目录和 404 文案硬编码中文。

**最终实施**

站点所有者确认保留中英文切换，采用有限国际化：

1. 保留语言按钮和 `/zh`、`/en` 路由。
2. 导航、Metadata、错误/加载/空状态、登录弹窗和无障碍标签全部进入语言包。
3. `<html lang>` 与当前 locale 一致。
4. 数据库文章、项目、分类和个人介绍保持原文，不增加双份字段，也不承诺自动翻译。
5. 自动测试检查中英文语言包键一致，并拒绝英文系统文案回退为硬编码中文。

**验收标准**

- 英文路由中的系统界面和 SEO 元信息为英文。
- 当前页面的 `lang` 属性正确。
- 创作内容是否翻译由所有者决定，不扩大数据库结构。

#### BUG-014：Header、Footer 与后台设置来源不统一

**现象**

- Header 与 Footer 分别在客户端请求 `owner_name`，会产生额外请求和潜在文本跳变。
- Header 的 GitHub 地址硬编码，后台 `about_github` 设置只影响关于页。

**修改建议**

1. 在 locale layout 的服务端一次性读取公开设置。
2. 将站点名和 GitHub URL 作为 props 传给 Header / Footer。
3. 删除 Header 中的硬编码 GitHub 地址。
4. 数据库不可用时提供合理默认值。

**验收标准**

- 修改后台 GitHub 地址后，Header 与关于页一致。
- Header 首屏不发生名称跳变。

#### BUG-015：项目和分类排序值不可管理

**现象**

Project 和 Category 都有 `sortOrder`，但后台没有调整入口。新建项目默认都是 0，只按 `sortOrder` 查询时，同值记录顺序不稳定。

**修改建议**

第一阶段：

1. 查询增加稳定的第二排序字段，例如 `createdAt`。
2. 后台增加简单数字顺序输入，暂不做拖拽排序。

**验收标准**

- 相同 `sortOrder` 的记录顺序稳定。
- 管理员可以调整展示顺序。

#### BUG-016：图片上传缺少生命周期管理

**现象**

- 上传图片立即写入公开 `public/uploads`。
- 删除文章中的图片、放弃草稿或删除文章时，文件不会清理。
- 草稿图片如果 URL 泄露，也能被公开访问。

**近期建议**

1. 记录限制：不要在草稿中上传真正私密附件。
2. 增加后台“未引用图片”检查或手工清理脚本。
3. 暂不实现复杂媒体库。
4. 上传接口除 MIME 外，可增加真实图片解码验证。

**验收标准**

- 有可执行的孤儿图片检查方式。
- 非真实图片文件不能仅靠伪造 MIME 上传。

#### BUG-017：缺少可控的错误页与加载状态

**现象**

公开页面直接依赖数据库，项目只有 404 页面，没有 `error.tsx` 和 `loading.tsx`。数据库不可用时容易显示框架默认 500。

**修改建议**

1. 增加公开端 `error.tsx`，显示简洁错误和重试按钮。
2. 对明显等待的动态页面增加克制的 loading 状态。
3. 不需要引入复杂监控平台；至少保留服务端结构化日志。

**验收标准**

- 模拟数据库异常时不暴露堆栈，也不是空白页。
- 用户可以重试或返回首页。

#### BUG-018：“退出后台”与“注销登录”语义容易混淆

**现象**

- “退出后台”只执行页面跳转，Session 仍然有效。
- “注销登录”才真正调用注销 API。
- 注销请求没有检查 `res.ok`，失败时仍可能跳转回首页，让用户误以为 Session 已失效。

**修改建议**

1. 将只跳转的按钮改名为“返回网站”。
2. 将真正清除 Session 的按钮命名为“退出登录”。
3. 注销失败时保留当前页面并显示错误。

**验收标准**

- 两个操作的文案与真实行为一致。
- 注销 API 失败时不会显示假成功。

#### BUG-020：首页项目卡片会丢失源码入口

**现象**

- `app/[locale]/page.tsx` 将数据库项目映射给 `LatestProjects` 时只传递 `demoUrl`，没有传递 `sourceUrl`。
- `components/home/LatestProjects.tsx` 也只支持 Demo 链接。
- 当前 Seed 项目只有 `sourceUrl`，因此首页项目卡片没有任何可点击入口；项目页本身则能显示源码链接。

这会直接削弱网站的求职展示目标。

**修改建议**

1. `LatestProjects` 的项目类型同时接收 `sourceUrl` 和 `demoUrl`。
2. 有 Demo 时显示“在线预览”，有源码时显示“查看源码”。
3. 两者都没有时不渲染伪链接。
4. 首页和项目页复用相同的链接呈现规则，避免再次分叉。

**验收标准**

- 只有源码链接的项目在首页仍有可用入口。
- 同时有源码和 Demo 时两个入口都清晰可辨。
- 外链均使用 `noopener noreferrer`。

#### BUG-021：文章分区修改后列表可能继续显示旧数据

**现象**

`components/admin/PostsList.tsx` 使用 `useState(initialPosts)` 保存文章列表，但没有在新的 `initialPosts` 到达时同步：

- 重命名分区后会调用 `router.refresh()`，侧栏分区名更新，但本地 `posts` 中的 `category.name` 仍可能是旧值。
- 删除分区后，文章表格可能暂时继续显示已删除的旧分区。
- 执行过搜索后，本地搜索结果更容易与服务端刷新结果脱节。
- 搜索目前只能按 Enter 触发，没有可见提交按钮或自动搜索反馈。

**修改建议**

1. 最小修改是在 `initialPosts` 变化时同步本地状态。
2. 更稳妥的近期方案是把“服务端初始列表”和“搜索结果”分开建模，并在清空搜索时回到最新服务端列表。
3. 分区创建、重命名和删除必须先检查 `res.ok`，成功后再刷新。
4. 搜索使用 `<form>` 提交或增加明确的搜索按钮，并提供失败反馈。

**验收标准**

- 分区重命名后，侧栏和文章表格立即显示同一名称。
- 删除分区后，相关文章立即显示“无分区”。
- 搜索后再修改分区不会保留旧关系数据。

#### BUG-022：中文文章 slug 点击后进入 404

**现象**

文章《Python 语法盲区梳理》已发布，后台和公开博客列表均能正常显示，但从博客卡片进入详情页后显示 404。线上数据中的 slug 为 `s0-s2阶段学习`。

**根因**

1. `generateUniqueSlug()` 的可读 slug 方案允许中文字符进入 slug。
2. 浏览器请求中文路径时会将中文编码为 `%E9%98%B6...`。
3. `app/[locale]/blog/[slug]/page.tsx` 原先直接使用路由参数执行 Prisma 精确查询，没有先统一解码。
4. 数据库保存的是原始中文，编码后的路由参数无法与其匹配，最终触发 `notFound()`。

这是历史问题的回归：早期代码曾通过改用纯时间戳 slug 绕开中文路径问题；后续实现 `REC-BLOG-002` 可读 slug 时重新允许了 Unicode 字符，但缺少中文路径回归测试。

**已实施修改**

1. 新增 `decodeRouteSegment()`，查询文章前对百分号编码的路由参数执行一次安全解码。
2. 纯英文 slug 保持不变；格式错误的百分号字符串不会使页面抛出异常。
3. 不批量修改现有文章 slug，避免旧链接失效。
4. 增加中文、英文和异常编码三种路由参数测试。

**验收标准**

- `/zh/blog/s0-s2%E9%98%B6%E6%AE%B5%E5%AD%A6%E4%B9%A0` 能显示对应文章。
- 现有纯英文 slug 文章仍能正常显示。
- 异常编码只会按普通未命中处理，不会导致 500。

### 4.3 P1：工程与安全

#### SEC-001：依赖审计存在高危和中危条目

2026-07-28 执行：

```bash
npm.cmd audit --omit=dev --registry=https://registry.npmjs.org
```

结果为：

- 16 个依赖告警。
- 11 个 High。
- 5 个 Moderate。

涉及 Next.js、Sharp、PostCSS，以及通过 Prisma / shadcn CLI 引入的工具链依赖。

这不等于网站存在 16 个可直接利用的漏洞。部分条目位于构建或 CLI 依赖中，部分当前没有修复版本，但必须进行分类处理。

**修改建议**

1. 重新执行 audit，保存最新结果。
2. 区分生产运行依赖与开发工具依赖。
3. 将仅开发期使用的 `shadcn`、`prisma` CLI 移入 `devDependencies`。
4. 将可安全升级的 direct dependency 升级到修复版本。
5. 不执行 `npm audit fix --force`，避免未经评估的主版本升级。
6. 每次升级后执行 lint、build 和核心页面回归。
7. 对暂时无修复版本的条目记录“是否可达”和缓解措施。

#### SEC-002：生产环境变量存在弱默认值

**现象**

`docker-compose.yml` 为数据库密码提供默认值 `blog`。如果生产 `.env` 缺失或拼写错误，系统不会立即失败，而可能以弱密码启动。

**修改建议**

对生产必需变量使用 Compose required 语法，例如：

```yaml
POSTGRES_PASSWORD: ${DB_PASSWORD:?DB_PASSWORD is required}
SESSION_SECRET: ${SESSION_SECRET:?SESSION_SECRET is required}
```

数据库名称和用户名是否保留默认值可以自行决定，但密码与 Session Secret 必须 fail fast。

#### SEC-003：Session Cookie 的 secure 依赖公开 URL 字符串

**现象**

Cookie 是否 `secure` 同时依赖 `NODE_ENV` 和 `NEXT_PUBLIC_SITE_URL` 是否以 `https` 开头。生产 URL 配错时，Secure 可能被关闭。

**修改建议**

域名与 HTTPS 正式启用后，生产环境直接设置：

```ts
secure: process.env.NODE_ENV === "production"
```

当前 30 天 Session 对个人后台可以使用，但建议评估缩短到 7–14 天。

#### SEC-004：基础安全响应头缺失

线上实测未返回以下响应头：

- `X-Content-Type-Options`
- `Referrer-Policy`
- `X-Frame-Options`
- `Permissions-Policy`
- `Strict-Transport-Security`

**修改建议**

1. 现在可以先增加 `nosniff`、Referrer Policy 和 Frame 限制。
2. HSTS 只在正式域名证书稳定后启用，不能在当前自签名 IP 阶段贸然开启。
3. CSP 会受内联主题脚本、Milkdown 和 Mermaid 影响，暂不作为本轮强制项。

#### SEC-005：CI/CD 将镜像仓库密码放在命令参数中

**现象**

以下两处都使用了 `docker login ... -p <密码>`：

- `.github/workflows/deploy.yml`
- `.workflow/pipeline-deploy.yml`

命令参数可能进入进程参数、Shell 历史或流水线日志。Docker 官方建议非交互登录使用 `--password-stdin`，以避免密码进入 Shell 历史或日志文件。（来源：[Docker 官方 `docker login` 文档](https://docs.docker.com/reference/cli/docker/login/#provide-a-password-using-stdin---password-stdin)）

**修改建议**

1. 两条流水线都改用受平台保护的 Secret 环境变量，通过标准输入传给 `docker login --password-stdin`。
2. 不在远程脚本正文中直接展开密码字面量。
3. 确保流水线没有启用 `set -x`，失败日志也不回显 Secret。
4. 条件允许时使用作用域受限的镜像仓库访问凭据，不复用个人主密码。

**验收标准**

- 流水线脚本和日志中不出现密码参数。
- 登录失败时流水线明确失败，成功时仍能拉取镜像。

#### SEC-006：后台新密码最低只要求 6 位

**现象**

- `app/api/auth/password/route.ts` 只要求新密码长度不少于 6。
- `components/admin/PasswordForm.tsx` 也向用户提示“至少 6 位”。
- 当前后台使用单因素密码登录，因此 6 位下限过于宽松。

NIST SP 800-63B-4 将单因素密码的最低长度基准设为 15 个字符，并建议允许至少 64 个字符，同时不要求机械的字符组合规则。这里把它作为安全基准，而不是声称个人网站承担美国政府系统的合规义务。（来源：[NIST SP 800-63B-4](https://pages.nist.gov/800-63-4/sp800-63b.html)）

**修改建议**

1. 前后端统一改为至少 15 个字符，允许空格和常见 Unicode 字符。
2. 不强制“大小写 + 数字 + 符号”等组合规则，优先鼓励密码管理器生成独立长密码。
3. 密码输入框补充正确的 `autocomplete="current-password"` 与 `autocomplete="new-password"`。
4. 保留现有限流，并确保错误信息不泄露 Hash 或内部异常。

**验收标准**

- 14 个及以下字符被前后端一致拒绝。
- 15 个及以上字符可正常修改和重新登录。
- 旧密码不能登录，日志中不出现明文密码。

#### ENG-001：Docker 构建存在版本漂移

**现象**

- Prisma CLI 阶段安装 `prisma@7`，不是精确版本。
- Runner 阶段再次执行未固定版本的 `npm install iron-session bcryptjs`。
- 这些安装没有使用主项目 lockfile。

**修改建议**

1. Prisma CLI 与 `@prisma/client` 使用相同精确版本。
2. Runner 额外安装的包固定精确版本，或调整构建方式使其来自已锁定的 deps 阶段。
3. 避免构建过程中解析“当前最新 7.x”。
4. 修改后比较镜像大小并执行容器启动测试。

#### ENG-002：缺少最小自动化测试

**近期建议**

不需要一次引入大型测试体系。项目已经有 `tsx`，可以先使用 Node Test Runner：

```json
{
  "scripts": {
    "test": "tsx --test tests/**/*.test.ts"
  }
}
```

第一批测试只覆盖纯逻辑：

1. Markdown 标题提取和重复 slug。
2. 发布时间与状态转换。
3. 阅读时长计算。
4. API 输入 Schema。
5. 旧 Tiptap JSON 转 Markdown。

移动端布局后续可补一个 Playwright Smoke Test，不要求在第一批同时完成。

#### ENG-003：公开页面缓存配置意图冲突

**现象**

首页、博客和项目页同时声明了：

```ts
export const dynamic = "force-dynamic"
export const revalidate = 3600
```

线上响应实际为 `private, no-cache, no-store`。这表示当前以每次请求动态读取为主，`revalidate` 没有表达出清晰、可验证的缓存策略。

**近期建议**

当前访问量较小时不必马上重做缓存。先明确选择：

1. 如果优先保证后台修改立即可见，保留 `force-dynamic` 并删除无效或误导性的 `revalidate`。
2. 如果以后需要降低数据库耦合，再改为按时间缓存，并在发布、项目和设置写操作后调用 `revalidatePath`。

不要在本轮 Bug 修复中同时引入复杂缓存标签体系。

#### ENG-004：生产环境缺少数据库 URL 时会启用假客户端

**现象**

`lib/db.ts` 将以下两种情况都视为 `isBuildTime`：

```ts
process.env.NEXT_PHASE === "phase-production-build"
process.env.NODE_ENV === "production" && !process.env.DATABASE_URL?.includes("://")
```

第二个条件意味着生产运行时一旦缺少或误配 `DATABASE_URL`，代码不会立即失败，而会启用 `createBuildSafeClient()`。该 Proxy 会让查询返回空数组或 `null`，让部分创建、更新和删除返回空对象。

**风险**

- 公开站点可能表现为“内容全空”，掩盖真正的数据库配置错误。
- 某些后台操作可能看似成功但没有持久化。
- 部署监控难以区分空数据和数据库故障。

**修改建议**

1. 构建假客户端只允许由明确的 `NEXT_PHASE === "phase-production-build"` 触发。
2. 生产运行时启动前校验 `DATABASE_URL`，缺失或格式错误就抛出明确错误并退出。
3. 不要在运行时数据库故障时返回伪造成功结果。
4. 为“生产缺少数据库 URL”增加一个无需真实数据库的单元测试。

**验收标准**

- 显式构建阶段仍可完成 `next build`。
- 生产运行时缺少 `DATABASE_URL` 会非零退出。
- 数据库不可用时 API 返回明确 500，不会返回假成功。

#### ENG-005：部署只执行 `up -d`，没有 Web 健康闭环

**现象**

- PostgreSQL 有 Healthcheck，但 Web 服务没有。
- Nginx 只依赖 Web 容器启动，不等待应用、数据库迁移和 HTTP 服务真正可用。
- 两条流水线执行 `docker compose up -d` 后立即结束，没有验证 Web 是否健康。

因此镜像拉取和容器创建成功，并不等于本次部署成功；迁移失败、启动崩溃或持续 502 可能要到人工访问时才发现。Docker 的 `HEALTHCHECK` 用于区分“进程存在”和“服务真正可用”。（来源：[Dockerfile 官方 HEALTHCHECK 说明](https://docs.docker.com/reference/dockerfile/#healthcheck)）

**近期修改建议**

1. 增加只返回最小状态的健康接口，并检查一次数据库连通性；不要泄露版本、环境变量或错误堆栈。
2. 为 Web 增加 Compose Healthcheck，并设置合理的 `start_period` 以容纳 migration。
3. 让 Nginx 和部署流水线等待 Web 进入 Healthy。
4. 超时后输出 Web 最后若干行日志并让流水线失败。
5. 当前阶段先做到“失败可见”，不必立即实现复杂自动回滚。

**验收标准**

- 正常部署在 Web Healthy 后才报告成功。
- 数据库不可达或 migration 失败时，流水线明确失败。
- 健康接口只返回通用状态，不暴露敏感信息。

**非阻塞容器硬化**

当前 `Dockerfile` 没有显式 `USER`。由于使用自定义基础镜像且本地 Docker daemon 未运行，本次不能据此断言容器一定以 Root 运行。后续应先检查最终镜像的 `Config.User`；如果为空或为 Root，再创建固定 UID/GID 的非特权用户，并确保 `/app/public/uploads` 对该用户可写。Docker 官方也建议无需特权的服务使用 `USER`。（来源：[Docker 构建最佳实践](https://docs.docker.com/build/building/best-practices/#user)）

#### MANUAL-002：备份任务存在文档声明，但恢复能力未验证

审计时 README 声明服务器有每日 PostgreSQL 备份和每周证书检查，但对应脚本不在仓库中，只能确认“文档有声明”，不能确认任务仍在运行或备份可以恢复。

**最终实施**

1. `ops/backup.sh` 同时备份 PostgreSQL 和 uploads，并生成 SHA-256 清单。
2. `ops/verify-backup.sh` 在资源受限的隔离容器真实执行 `pg_restore` 并读取主要表。
3. `ops/install-maintenance-cron.sh` 幂等安装每日备份、每周恢复验证和证书检查。
4. 部署、正文转换和上传清理复用同一版本化备份入口。
5. 整机丢失仍需要异地云盘快照，状态与步骤记录在 `disaster-recovery.md`。

代码与定时维护已自动化；云盘异地副本仍属于云账号所有者操作，不能由仓库代码伪造完成状态。

## 5. 适合当前阶段的产品改造

### 5.1 博客

#### REC-BLOG-001：本地自动草稿与离开提醒

当前没有自动保存。近期不必马上设计服务端版本历史，可以先：

1. 编辑时每隔数秒将标题、正文、摘要、分类和标签写入 `localStorage`。
2. 成功保存到服务器后清除本地草稿。
3. 打开编辑页发现较新的本地草稿时，提示恢复。
4. 有未保存修改时使用 `beforeunload` 提醒。

这能以较小改动降低长文丢失风险。

#### REC-BLOG-002：新文章使用可读 slug

当前 slug 是时间戳的 base36 字符串，不利于识别和分享。

建议只对新文章使用标题生成 slug，并在冲突时增加短后缀。现有 slug 保持不变，避免已有链接失效。

#### REC-BLOG-003：暂不急于分页

当前文章数量很少，分页不是近期阻塞项。

建议达到约 30–50 篇文章后再增加分页或“加载更多”。当前先修排序、目录和搜索历史污染问题。

#### REC-BLOG-004：搜索 URL 使用 replace

搜索框每次更新参数都使用 `router.push`，可能让浏览器后退历史充满每次输入状态。

建议搜索与筛选使用 `router.replace`，或只在提交时 push。

### 5.2 Idea / Todo

#### REC-TODO-001：先完善现有模型，不新建大型知识系统

当前数据已经通过 `idea` 分区区分想法。近期不建议立刻拆出 Note、Idea、Task、Reference 四套表。

第一阶段复用现有 Todo：

1. 支持编辑标题。
2. 支持展开编辑 `description`。
3. 暴露已有 `priority` 和 `dueDate`。
4. 增加“未完成 / 已完成 / 全部”筛选。
5. 增加标题与描述搜索。
6. 完成长文本在移动端的正常展示。

#### REC-TODO-002：增加轻量 Inbox

为了替代“发给自己的聊天栏”，可以把 `/admin/todos` 首屏改为快速收集体验：

1. 输入框默认聚焦。
2. Enter 快速保存。
3. 保存失败不清空内容。
4. 默认分区记住上一次选择。
5. 手机端打开后一步即可输入。

暂不做原生 App、PWA Share Target 或微信机器人。

#### REC-TODO-003：Idea 转博客草稿作为第二阶段

在 Todo 基础稳定后，可以增加一个小功能：

- 将 Todo 的标题和描述创建为 Post 草稿。
- 成功后保留原 Todo，并让用户选择是否标记完成。

不要在第一批 Bug 修复中同时实现。

### 5.3 首页、关于页和项目页

#### REC-PORTFOLIO-001：首页明确个人身份

当前 Hero 的 H1 是“欢迎”，辨识度不足。

建议利用现有 Settings：

1. H1 显示姓名或稳定的个人品牌名。
2. 副标题写目标方向，例如“全栈开发 / 自动化测试 / Agent 工具探索”。
3. 保留“阅读博客”和“查看项目”两个动作。
4. 不需要新增大型 Hero 图片或复杂动画。

#### REC-PORTFOLIO-002：关于页先补真实内容

不必新增复杂履历系统，先完善现有设置：

1. 一段具体的个人介绍。
2. 当前学习或求职方向。
3. 真实联系方式。
4. GitHub。
5. 有正式简历时再增加下载入口。

#### REC-PORTFOLIO-003：项目卡片增加证据

当前只有一个项目，不建议现在开发完整 Case Study CMS。

第一阶段：

1. 修复单个项目只占半栏的问题。
2. 确保源码和 Demo 链接都清晰可见。
3. 增加一个可选封面图字段，复用现有图片上传。
4. 描述中写清楚“解决了什么问题”，不要只列技术栈。

当真实项目达到 2–3 个后，再考虑项目详情页。

#### REC-PORTFOLIO-004：移动或收敛猫按钮

猫按钮有个人辨识度，可以保留图标，但不应遮挡移动端卡片。

最终选择保留右下角悬浮入口：

1. 使用 48px 圆形图标和移动端安全区偏移。
2. 主内容在移动端保留底部空间。
3. 登录后点击直接进入后台，未登录时打开登录弹窗。

### 5.4 SEO 与公开站点基础

#### REC-SEO-001：增加基础元数据

当前所有页面共用 `QZ Site` 标题和通用 description。

建议增加：

1. 首页、博客、项目、关于页各自 title 和 description。
2. 文章页 `generateMetadata`，使用文章标题和摘要。
3. 正式域名上线后增加 canonical URL。
4. 增加 Open Graph 基础字段。
5. 增加 `sitemap.ts` 和 `robots.ts`。

RSS 可以等文章数量增加后再做，不是当前 P0。

#### REC-SEO-002：字体改为本地或 Next Font

当前通过 Google Fonts CDN 加载字体，ESLint 已给出相关警告。在国内网络环境下可能不稳定。

建议使用 `next/font` 或本地字体文件，减少外部依赖和字体闪烁。

### 5.5 可用性与无障碍

近期只做低成本修复：

1. GitHub 图标链接增加 `aria-label`。
2. 移动菜单按钮增加 `aria-label`、`aria-expanded` 和 `aria-controls`。
3. Todo 勾选按钮增加任务名称与状态说明。
4. 删除图标按钮增加可访问名称。
5. Lightbox 保留原图片 alt，并处理关闭后的焦点恢复。
6. 不要只依赖 Hover 暴露关键操作。
7. 修复后台 `<Link><Button /></Link>` 形成的嵌套交互元素，改为带按钮样式的 Link 或组件库支持的 `render` 方式。

## 6. 暂不建议实施

以下方向可能有价值，但不适合当前阶段：

| 暂不实施项 | 原因 |
|---|---|
| AI 自动分类、摘要、写作 | 当前基础数据结构和可靠性尚未稳定 |
| 向量数据库、RAG、知识图谱 | 对现有少量内容属于明显过度设计 |
| 微信机器人或收藏自动同步 | 涉及平台权限、稳定性和隐私，先验证手动 Inbox |
| 原生移动 App | 响应式后台尚未完成 |
| 多用户、注册、角色权限 | 网站当前是单人使用 |
| 评论、点赞、关注系统 | 与三个核心目标关系较弱 |
| 实时协作、WebSocket 同步 | 单人场景没有收益 |
| 完整媒体库与在线图片编辑 | 当前只需孤儿文件检查和基础清理 |
| 完整项目 Case Study CMS | 真实项目数量不足，先完善卡片内容 |
| 全站视觉重做 | 当前设计基线可用，先修信息与功能 |

## 7. 推荐执行顺序

### 7.1 第一批：正确性和数据安全

范围：

1. BUG-001 邮箱键名。
2. BUG-002 Markdown 目录。
3. BUG-003 文章排序。
4. BUG-004 发布时间与状态。
5. BUG-006 迁移启动逻辑。
6. BUG-019 Seed 配置、密码覆盖与退出码。
7. ENG-004 生产数据库配置必须失败退出。
8. SEC-006 后台密码长度下限。
9. MANUAL-001 密码与 Session Secret 轮换由用户执行。

完成标准：

- 不修改整体视觉。
- 数据兼容。
- 增加对应纯逻辑测试。

### 7.2 第二批：移动端和操作可靠性

范围：

1. BUG-005 移动端 Todo。
2. BUG-007 请求失败反馈。
3. BUG-008 删除确认。
4. BUG-009 移动端后台列表。
5. BUG-011 主题一致性。
6. BUG-012 编辑器深色样式。
7. BUG-018 退出与注销语义。
8. BUG-017 错误页与加载状态。
9. BUG-020 首页项目源码入口。
10. BUG-021 文章分区状态同步。
11. 基础无障碍修复。

完成标准：

- 390px、768px、1440px 三种视口截图通过。
- 所有写操作都检查 HTTP 状态。

### 7.3 第三批：API、依赖和部署

范围：

1. BUG-010 输入校验和错误映射。
2. SEC-001 依赖分类升级。
3. SEC-002 必需环境变量。
4. SEC-003 Cookie 配置。
5. SEC-004 基础安全响应头。
6. SEC-005 CI/CD 凭据改用标准输入。
7. BUG-016 图片上传生命周期。
8. ENG-001 Docker 版本固定。
9. ENG-002 最小测试脚本。
10. ENG-003 缓存配置清理。
11. ENG-005 Web Healthcheck 与部署等待。
12. MANUAL-002 备份恢复能力由有服务器权限的人核验。

完成标准：

- 非法输入不会返回通用 500。
- Docker 构建可复现。
- CI 至少执行 lint、test、build。

### 7.4 第四批：轻量产品提升

范围：

1. Todo 编辑、描述、优先级、日期、搜索和筛选。
2. 本地自动草稿与离开提醒。
3. 首页个人身份文案。
4. 项目卡片证据增强。
5. BUG-013 隐藏不完整的英文入口并修正页面语言。
6. BUG-014 Header、Footer 和设置来源统一。
7. BUG-015 项目与分类排序管理。
8. 基础 SEO 元数据。

完成标准：

- 不引入 AI、向量数据库、多用户或大型 CMS。
- 仍然保持站点简单、可维护。

## 8. 回归检查清单

### 8.1 公开页面

- [ ] `/zh` 首页桌面和手机正常。
- [ ] 只有源码链接的项目在首页仍可点击。
- [ ] `/zh/blog` 分类与搜索正常。
- [ ] 搜索不会产生大量浏览器历史。
- [ ] Markdown 长文目录正常。
- [ ] 代码、公式、Mermaid、表格和图片正常。
- [ ] `/zh/projects` 单项目和多项目布局正常。
- [ ] `/zh/about` 显示正确联系方式。
- [ ] 404 与数据库错误页可用。

### 8.2 后台

- [ ] 无登录 Cookie 无法进入 `/admin`。
- [ ] 错误密码限流仍有效。
- [ ] 注销成功后 Session 失效。
- [ ] 后台拒绝少于 15 个字符的新密码。
- [ ] 新建、编辑、草稿、发布文章正常。
- [ ] 文章分区重命名或删除后，列表立即同步。
- [ ] 发布时间无时区偏移。
- [ ] 图片上传格式与大小校验正常。
- [ ] Todo 新增、编辑、勾选、删除、筛选正常。
- [ ] API 失败时不清空未保存内容。
- [ ] 手机端分区和列表可操作。

### 8.3 工程

- [ ] `npm.cmd run lint`
- [ ] `npm.cmd run test`
- [ ] `npm.cmd run build`
- [ ] `npx.cmd prisma validate`
- [ ] migration 可在空数据库执行。
- [ ] migration 可在现有数据库执行。
- [ ] `npx prisma db seed` 可执行，重复 Seed 不改变管理员密码 Hash。
- [ ] Seed 失败时进程以非零状态退出。
- [ ] 缺少生产密码或 Session Secret 时 Compose 明确失败。
- [ ] 生产运行时缺少 `DATABASE_URL` 时 Web 明确失败，不能启用假客户端。
- [ ] CI/CD 日志与命令参数不出现镜像仓库密码。
- [ ] 部署只有在 Web Healthy 后才报告成功。
- [ ] Docker 容器重启后数据库和上传文件仍存在。

## 9. 后续 Agent 交付要求

后续 Agent 在实施时应提供：

1. 修改文件列表。
2. 新 migration 的作用说明。
3. 数据兼容与回滚方式。
4. 实际执行过的验证命令及结果。
5. 桌面端和移动端关键页面截图。
6. 未解决项及原因。

不得把本文档中的“暂不建议实施”内容自行扩展进当前修改范围。
