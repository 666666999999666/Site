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
