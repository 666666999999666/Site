# 依赖审计记录

## 2026-07-29

执行命令：

```bash
npm audit --omit=dev --registry=https://registry.npmjs.org
```

在升级 Next.js、Prisma、`pg` 并将 Prisma CLI 与 shadcn 移到 `devDependencies` 后，生产依赖报告从审计初期的 16 项降为 3 项 High：

| 依赖 | 来源 | 处理 |
|---|---|---|
| PostCSS `<8.5.18` | Next.js 固定 `8.4.31` | 通过 npm override 固定为 `8.5.24`，再执行 lint、测试和 build |
| Sharp `<0.35.0` | Next.js optional dependency `^0.34.5` | 不强行覆盖到 Next 尚未声明兼容的 minor 版本；禁用 Next 图片优化、Nginx 拒绝 `/_next/image`，最终镜像删除 Sharp 与 libvips |

Next.js 上游仍有公开问题跟踪 Sharp 告警：

- <https://github.com/vercel/next.js/issues/96064>

**可达性判断**：网站的项目封面使用原始 `/uploads` 文件，Markdown 图片使用原生 `<img>`，都不经过 Next Image Optimizer。上传 API 只读取少量 magic bytes，不调用 Sharp。生产入口同时拒绝 `/_next/image`，最终运行镜像也不包含 Sharp。因此该 Sharp 告警存在于开发 lockfile 的 Next optional dependency 中，但不在生产运行路径。

每次 Next.js 升级后应重新检查：

1. 上游是否已将 Sharp 升级到无告警版本。
2. `npm audit --omit=dev` 的结果。
3. 最终镜像内是否不存在 `node_modules/sharp` 和 `node_modules/@img`。
4. 项目封面、文章图片和上传接口是否仍正常。

## 2026-08-01 复核

再次执行同一命令，结果为 **2 项 High**，均来自 `next@16.2.12` 间接安装的 `sharp@0.34.5`。npm 当前建议的自动修复会把 Next.js 强制降到 `14.2.35`，属于破坏性变更，不应执行。

复核时 Next.js 最新稳定版仍为 `16.2.12`，其 `optionalDependencies` 仍声明 `sharp: ^0.34.5`；Sharp 无告警版本已经进入 `0.35.x`，超出 Next.js 当前声明的兼容范围。继续保留上面的运行时隔离措施，等待 Next.js 官方更新依赖约束后再常规升级。该告警是明确接受的构建期残余风险，不应表述为“依赖审计清零”。

## 2026-08-04 MCP 依赖复核

引入官方 `@modelcontextprotocol/sdk@1.30.0` 后，首次审计发现其 HTTP 传输依赖中的 Hono、`@hono/node-server`、`fast-uri` 和 `ip-address` 告警。执行非破坏性的 `npm audit fix` 后，这些传递依赖均更新到修复版本；随后重新通过 TypeScript、Lint、单元测试、真实 stdio MCP 集成测试和生产构建。

当前仍为 **2 项 High**，均是上文记录的 Next.js optional Sharp 链路。MCP 只启用 stdio transport，不启动 SDK 的 Hono/Express HTTP 服务；禁止使用 `npm audit fix --force` 把 Next 强升到当前版本约束之外。

## 2026-08-08 安全同步复核

同步安全修复与 MCP 后，`npm audit fix` 在现有 semver 范围内更新了 Mermaid、DOMPurify、js-yaml 与 nanoid，清除了对应的 XSS、原型污染和 DoS 告警。随后重新通过单元测试、Lint、TypeScript、生产构建和真实浏览器 CSP/Mermaid 验证。

`npm audit --omit=dev --registry=https://registry.npmjs.org` 仍报告 **2 项 High**，均来自 `next@16.2.12` 的 optional `sharp@0.34.x`。生产继续使用既有隔离：`images.unoptimized=true`、Nginx 拒绝 `/_next/image`，最终镜像删除 `sharp` 与 `@img`。自动强制修复会把 Next.js 改到当前固定版本之外，未在本次安全同步中执行。

## 2026-08-09 OAuth MCP 复核

引入稳定版 `@better-auth/oauth-provider@1.6.26` 后，审计结果为 **1 项 Moderate、2 项 High**。High 仍是上文已隔离的 Sharp 链路；Moderate 是 [GHSA-p2fr-6hmx-4528](https://github.com/advisories/GHSA-p2fr-6hmx-4528) 所述的 OAuth Resource Indicator 未绑定问题，当前没有可用修复版本。

本站只有一个合法 Resource：`https://liaoqizai.site/api/mcp`。应用路由在 Authorization Code 和 Refresh Token 流程中都强制请求携带且只能携带这一精确 `resource`，Access Token 的 `aud` 也固定为同一地址；缺失、重复或错误 Resource 均由集成测试拒绝。因此公告中的跨 Resource 换取 Token 路径在本站不可达，但 `npm audit` 仍会按包版本报告该条目。Better Auth 发布修复版后应升级并保留这些应用层校验。

## 2026-08-10 远程导入复核

`npm audit --omit=dev --registry=https://registry.npmjs.org` 仍为 **1 项 Moderate、2 项 High**，没有新增公告。Registry 当前版本分别为 Next.js `16.3.0`、`@better-auth/oauth-provider` `1.6.26`、MCP SDK `1.30.0`、Sharp `0.35.3`。

- OAuth Provider 仍没有稳定修复版；本站继续强制唯一 Resource、固定 `aud`，并在 Authorization Code 与 Refresh 两条路径拒绝缺失、重复和错误 Resource。
- Next.js `16.3.0` 已可用，但它超出当前 `16.2.12` 固定版本。本轮同时迁移 OAuth scope、远程上传与生产调度，不叠加框架升级；Sharp 继续通过 `images.unoptimized`、Nginx 拒绝 `/_next/image` 和最终镜像删除 `sharp`/`@img` 隔离。
- 远程 Markdown 图片上传不调用 Sharp，只用文件签名和 SHA-256 校验。无票据请求在读取 Body 前即返回 401，票据只绑定一个 bundle 中声明的图片。

以上为明确接受的残余风险，不允许运行 `npm audit fix --force`。Next.js 升级应单独提交并完整回归编辑器、OAuth、MCP、公开图片和生产镜像内容。
