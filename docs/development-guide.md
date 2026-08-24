# QZ Site 开发与变更指南

> **文档定位**：本文说明后续开发应先读什么、代码应该改在哪里、不同改动需要做哪些验证。最后核对日期为 **2026-08-25**。系统结构和设计原因见 [`architecture.md`](architecture.md)，生产操作见 [`operations.md`](operations.md)。

## 1. 开始开发前

后续开发者或 Agent 应按以下顺序读取：

1. `README.md`：项目入口、常用命令和文档索引。
2. `docs/architecture.md`：当前系统边界和关键设计决策。
3. 本文：改动位置、验证要求和交付清单。
4. `docs/operations.md`：涉及数据库、部署、上传、证书或流水线时必读。
5. `docs/site-audit-and-improvement-plan.md`：只用于理解历史问题与已完成改造，不应重复执行。

开始前必须执行：

```bash
git status --short --branch
git log -5 --oneline
```

工作区可能包含站点所有者尚未提交的改动。应理解并保留这些改动，不得通过 `reset --hard`、强制覆盖整文件或批量回退清理。

## 2. 本地环境

建议版本与生产构建保持一致：

| 依赖 | 版本 |
|---|---|
| Node.js | 22 |
| npm | 11.12.1 |
| PostgreSQL | 16 |

初始化：

```bash
npm ci --legacy-peer-deps
cp .env.example .env
npx prisma validate
npx prisma generate
npx prisma migrate deploy
npm run db:seed
npm run dev
```

本地 `.env` 至少需要：

- 指向本地 PostgreSQL 的 `DATABASE_URL`。
- 至少 32 个字符的 `SESSION_SECRET`。
- 首次创建管理员时至少 15 个字符的 `SEED_PASSWORD`。
- 本地地址形式的 `NEXT_PUBLIC_SITE_URL`。

Seed 是幂等初始化工具：已有管理员、设置、项目和分区不会被覆盖。它不是生产数据同步工具。

## 3. 代码放置规则

| 需求 | 优先位置 | 原则 |
|---|---|---|
| 新公开页面或 Metadata | `app/[locale]/` | 只开放 `zh`，同时考虑中文 canonical、SEO 和空状态 |
| 新后台页面 | `app/admin/`、`components/admin/` | 服务端布局继续做真实 Session 校验 |
| 新 HTTP 接口 | `app/api/` | 认证、输入校验、统一错误处理缺一不可 |
| 可复用业务规则 | `lib/` | 可独立测试或被多个入口使用时再抽取 |
| 数据结构变化 | `prisma/schema.prisma`、`prisma/migrations/` | Schema 与 migration 同提交 |
| 中文界面文案 | `messages/zh.json` | 保持集中管理，不重新建立英文语言包或切换入口 |
| 生产操作 | `ops/` | 固定参数、默认只读、写操作先备份 |
| Gitee 流水线 | `.workflow/` | 构建不落生产机，Secret 不回显 |

不要直接编辑 `lib/generated/prisma/`。该目录由 `npx prisma generate` 生成并被 Git 忽略。

## 4. 常见改动方法

### 4.1 新增或修改公开页面

1. 优先在 Server Component 中读取数据，只有交互部分才使用 Client Component。
2. 数据库驱动页面需要即时反映后台内容时，继续使用动态渲染。
3. 对公开详情页同时处理 `Metadata`、canonical、Open Graph 和不存在状态。
4. 公开文章查询必须限制 `status: "PUBLISHED"`。
5. 新界面文案只维护 `messages/zh.json`；测试应验证中文文案包完整、路由 locale 只有 `zh`，并防止英文包或语言切换入口被重新引入。
6. 页面级 Metadata 的 canonical、Open Graph、JSON-LD、sitemap 和 RSS 只生成 `/zh` URL，不生成英文 alternate 或 hreflang。
7. 数据库创作内容保持作者原文；英文文章、技术名词和英文 slug 不属于英文界面模块。除非出现明确内容需求，不增加 `titleZh/titleEn` 一类重复字段。
8. 在 390px、768px 和 1440px 宽度检查布局、文字换行和交互。
9. `next-intl` 的 Client Provider 只存在于 `app/[locale]/layout.tsx`。同时被 `/admin` 使用的共享组件不能直接调用 `useTranslations()`，应由公开页面调用方传入翻译后的文案，并回归测试已登录后台的完整页面渲染。

`/en` 与任何 `/en/**` 是永久退役合同：必须返回 `410 Gone`，不得附带 `Location`，也不得通过 cookie、浏览器语言或未知 locale 回退重新渲染。匹配必须按完整路径段进行，不能误伤 `/energy`、`/english`。`robots.txt` 不应屏蔽 `/en`，否则搜索引擎无法抓取并确认 410。

### 4.2 新增管理 API

管理写接口应保持以下结构：

```ts
export async function POST(request: NextRequest) {
  try {
    await ensureAuthenticated()
    const input = validateSomething(await readJsonObject(request))
    const result = await doSomething(input)
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
```

具体要求：

- 默认先调用 `ensureAuthenticated()`；公开读取必须是显式产品需求。
- 在 `lib/validation.ts` 定义允许字段，拒绝未知键。
- 长度、枚举、日期时区、URL 和文件路径在服务端再次校验。
- 多个写操作必须共同成功时使用 Prisma 事务。
- 可预期失败使用 `AppError` 子类，不向客户端泄漏内部异常。
- 前端用 `apiRequest()`/`jsonRequest()`，避免各组件自行猜测错误格式。
- 为新规则补充聚焦测试；关键数据库事务应使用隔离测试数据库做一次集成验证。

### 4.3 修改文章或编辑器

- 数据库中的 `Post.content` 始终是 Markdown。
- 正文渲染、目录、阅读时长和上传引用继续复用 `lib/content.ts`。
- 不在组件中增加另一套标题 slug 或 Tiptap 转换函数。
- 发布时间规则只改 `lib/post-policy.ts`，并同步测试首次发布、更新、退回草稿和指定时间。
- Todo 转文章必须创建 `DRAFT`，不能直接公开发布。

涉及旧正文转换时，先执行 dry-run：

```bash
npm run content:migrate
```

生产 `--apply` 只能通过 `ops/content-migration.sh`，脚本会先备份。

### 4.4 新增公开设置

至少同步修改：

1. `PUBLIC_SETTING_KEYS`：允许的键。
2. `DEFAULT_PUBLIC_SETTINGS`：数据库不可用或未配置时的默认值。
3. `SettingsForm`：后台输入与保存。
4. 使用该设置的公开页面或组件。
5. `prisma/seed.ts`：仅在确有合理默认值时初始化。
6. `docs/architecture.md`：设置用途或隐私边界变化时更新。

旧键兼容应通过正式 migration 复制值。先保留旧键，确认新代码稳定后再决定是否清理，不在 API 请求期间隐式重写历史数据。

### 4.5 修改 Prisma Schema

开发流程：

```bash
npx prisma migrate dev --name meaningful_name
npx prisma validate
npx prisma generate
```

提交时检查：

- `schema.prisma` 与新 migration SQL 同时存在。
- migration 对现有生产数据可执行。
- 应用回滚后旧版本仍能容忍新结构。
- 新增必填字段时先考虑 nullable/default 与分阶段填充。
- 没有使用 `prisma db push` 代替 migration。

生产上线前必须有数据库与上传文件的同一时点备份。应用部署回滚不等于数据库回滚。

### 4.6 修改上传能力

- 新格式必须先实现实际文件签名检测，再开放扩展名。
- 路径仍限制在 `/uploads/<安全文件名>`，禁止接受任意磁盘路径或远程 URL 作为项目封面。
- Web 对目录只写必要文件，Nginx 保持只读。
- 新引用位置必须同步加入孤儿文件扫描，否则清理脚本可能误删。
- 删除或批量清理前先运行 dry-run，并保留 24 小时保护期。

### 4.7 修改认证

- `/admin` 页面保护和 API 鉴权是两层不同责任，不能只改其中一层。
- Session Secret 只来自环境变量，生产不得提供弱默认值。
- 密码 Hash 继续使用经过验证的库，不自行实现加密算法。
- 修改登录限流时，先判断是否真的需要多实例持久化，避免无需求引入 Redis。
- 涉及 Cookie、代理头或登录入口时，回归登录、退出、改密后退出和未登录 401。
- 修改后台布局所使用的共享组件时，必须在不提供 `NextIntlClientProvider` 的条件下验证渲染；`tests/component-boundaries.test.ts` 固化了这一边界。

### 4.8 修改部署或运维

- 生产机只负责拉取代码、备份、拉取镜像、migration、切换容器和健康检查。
- 不在 Gitee Agent 阶段执行 `docker build`、`npm ci`、`next build` 或完整测试。
- 写操作应默认拒绝或先备份；手动维护入口只允许固定白名单动作。
- TCR 凭据用平台 Secret 和 `docker login --password-stdin`，任务结束 logout。
- 部署脚本修改后至少检查 Shell 语法、Compose 配置和失败回滚路径。
- `.dockerignore` 与 `scripts/source-fingerprint.mjs` 必须保持相同排除语义；新增构建输入后要确认它会进入指纹。
- 不删除 `.source-fingerprint`，也不绕过 `ops/verify-release.sh` 或 `ops/smoke-test.sh`。
- `ops/maintenance.sh` 继续只接受固定动作，不允许把任意 Shell 文本作为变量执行。

## 5. 自动化验证

完整质量门禁：

```bash
npm run lint
npm test
npx tsc --noEmit
npx prisma validate
npm run build
node scripts/source-fingerprint.mjs .
bash -n ops/*.sh
```

| 改动类型 | 最低验证 |
|---|---|
| 仅 Markdown 文档 | 相对链接可解析、文档内容与当前代码一致 |
| 样式或组件 | Lint、TypeScript、Build、桌面与移动截图 |
| API 或业务规则 | Lint、测试、TypeScript、Build、未登录边界 |
| Prisma Schema | 完整门禁、migration SQL 复核、隔离数据库迁移 |
| 正文转换 | 完整门禁、转换测试、dry-run、备份后 apply |
| 上传 | 完整门禁、文件签名测试、路径逃逸测试、持久化检查 |
| Docker/Nginx | 完整门禁、镜像构建、容器用户、Healthcheck、`nginx -t` |
| CI/CD | 完整门禁、Shell 语法、源码指纹、实际流水线、生产冒烟与发布来源状态 |

不能把“配置文件已提交”写成“平台运行已验证”。流水线、镜像、容器和生产恢复都必须保留实际执行证据。

## 6. Gitee Go 与仓库同步

仓库当前有 **2 份 Gitee Go 定义**：

| 流水线 | 文件 | 触发方式 | 作用 | 当前验证状态 |
|---|---|---|---|---|
| `pipeline-deploy` | `.workflow/pipeline-deploy.yml` | 推送 `main` | 云端构建 Web 镜像并由 Agent 部署 | 已实际运行通过 |
| `pipeline-maintenance` | `.workflow/pipeline-maintenance.yml` | 手动 | 故障或证书轮换时执行固定白名单动作 | 共用脚本路径由自动部署的 `status` 步骤持续验证 |

这不是两条重复部署链路。自动流水线负责日常发布，并在发布后自动执行维护入口的 `status`；手动流水线只在故障处理、临时备份、恢复验证或证书轮换时使用，不要求每次发布人工点击。

GitHub 只作为仓库镜像，`.github/workflows/` 当前没有工作流。发布后应确认 Gitee 与 GitHub 的 `main` 指向同一提交，但生产部署只以 Gitee 链路为准。

## 7. 生产数据规则

| 场景 | 正确做法 | 禁止做法 |
|---|---|---|
| 本地开发 | 使用本地 PostgreSQL、测试数据和本地上传 | 连接生产库做日常调试 |
| Schema 演练 | 在隔离数据库运行 migration | 在生产先试 `db push` |
| 内容迁移 | 先 dry-run，再同时备份 DB/uploads | 无备份直接批量更新 |
| 数据恢复 | 恢复同一 `BACKUP_SET` 的 dump 和 uploads | 混用不同时间点备份 |
| 生产修复 | 使用受控脚本、事务和可审计步骤 | 手工执行来源不明 SQL |
| 部署 | 使用不可变镜像 digest | 长期依赖浮动 tag 作为运行状态 |

生产数据库中已有文章、Todo、项目、设置和用户，任何本地 Seed 或空库结果都不能用于判断生产内容应该是什么。

## 8. 文档维护责任

代码和文档应在同一提交中保持一致：

| 变更 | 需要更新的文档 |
|---|---|
| 目录边界、数据流、模型含义、关键设计 | `architecture.md` |
| 开发步骤、测试命令、改动规范 | `development-guide.md` |
| 部署、备份、证书、Agent、生产故障 | `operations.md` |
| 新发现的问题、风险或范围判断 | `site-audit-and-improvement-plan.md` |
| 依赖告警与可达性结论 | `dependency-audit.md` |
| 项目入口和文档顺序 | `README.md` |

`session-summary.md` 是历史过程记录，允许保留当时失败方案和旧技术，但必须显著标注为历史，不能作为当前架构或运维依据。

## 9. 交付检查清单

每批改动完成后确认：

1. 改动只覆盖需求范围，没有回退用户已有修改。
2. 数据与认证边界未被放宽。
3. 对应最低测试已执行并记录结果。
4. 相关文档与实际代码一致。
5. 没有提交 `.env`、密码、Token、证书私钥、备份或生产数据。
6. Gitee 与 GitHub 的目标提交一致。
7. 需要发布时，Gitee 自动流水线成功且生产健康检查通过。
8. 临时数据库、测试容器、调试文件和本地服务已清理。
9. `.deploy-state` 的提交、镜像 digest 和源码指纹与运行容器一致。
