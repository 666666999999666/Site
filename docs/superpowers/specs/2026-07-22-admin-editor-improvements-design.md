# 后台与编辑器改进设计

日期：2026-07-22

## 概述

修复5个用户反馈问题：标语字段清理、博客发布时间可编辑、阅读时间计算修复、博客副标题文案更新、编辑器深色模式修复。

## 问题1：删除 tagline 字段

**现状**：SettingsForm 有 `tagline` 和 `home_tagline` 两个标语字段，但前台只使用 `home_tagline`，`tagline` 无任何消费者。

**方案**：
- 从 `SettingsForm.tsx` 移除 `tagline` 字段和对应输入框
- 从 `prisma/seed.ts` 移除 `tagline` 种子数据
- 数据库中已有的 `tagline` 记录保留（不影响功能，避免数据迁移）

**改动文件**：
- `components/admin/SettingsForm.tsx` — 删除 tagline 字段
- `prisma/seed.ts` — 删除 tagline 种子数据

## 问题2：博客添加发布时间字段

**现状**：PostForm 没有时间字段，`createdAt` 由 Prisma `@default(now())` 自动生成且不可手动修改。

**方案**：
- Prisma schema 新增 `publishedAt DateTime?` 可选字段
- PostForm 添加「发布时间」datetime-local 输入框，默认为空（创建时自动设为 now）
- API 创建时：如果未提供 publishedAt，设为 `new Date()`
- API 更新时：允许修改 publishedAt
- 前台展示：使用 `publishedAt ?? createdAt` 显示发布日期
- `db push` 同步表结构

**改动文件**：
- `prisma/schema.prisma` — Post 模型新增 publishedAt
- `components/admin/PostForm.tsx` — 新增发布时间输入框
- `app/api/posts/route.ts` — 创建时处理 publishedAt
- `app/api/posts/[id]/route.ts` — 更新时处理 publishedAt
- `app/[locale]/blog/page.tsx` — 展示用 publishedAt
- `app/[locale]/blog/[slug]/page.tsx` — 展示用 publishedAt
- `components/blog/BlogCard.tsx` — 展示用 publishedAt
- `components/home/RecentPosts.tsx` — 展示用 publishedAt
- `prisma/seed.ts` — 种子数据添加 publishedAt

## 问题3：修复阅读时间计算

**现状**：`calculateReadTime()` 用正则 `/<[^>]+>/g` 去 HTML 标签，但 Tiptap 存储的是 JSON 格式，正则无效，实际计算的是 JSON 字符串长度。

**方案**：
- 重写 `calculateReadTime` 函数：从 Tiptap JSON 递归提取 text 节点内容
- 保留现有计算逻辑（中文每分钟 300 字，最少 1 分钟）
- 修复 `RecentPosts.tsx` 中硬编码的阅读时间文本，改用翻译系统

**改动文件**：
- `lib/posts.ts` — 重写 calculateReadTime，支持 Tiptap JSON 输入
- `components/home/RecentPosts.tsx` — 使用翻译系统替代硬编码

## 问题4：博客副标题文案更新

**现状**：`blog.description` 硬编码在翻译文件中，中文为"关于 Web 开发、设计和技术的思考。"

**方案**：保持硬编码，仅修改文案：
- 中文：`关于 Web 开发、设计和技术的思考。` → `关于开发、设计和技术的思考。`
- 英文：`Thoughts on web development, design, and technology.` → `Thoughts on development, design, and technology.`

**改动文件**：
- `messages/zh.json` — 修改 blog.description
- `messages/en.json` — 修改 blog.description

## 问题5：编辑器深色模式修复

**现状**：PostEditor 的 Tiptap 编辑器区域缺少 `dark:prose-invert`，深色模式下文字不可见。前台 PostContent 已正确使用 `dark:prose-invert`。

**方案**：
- 在 PostEditor 的编辑器 class 中添加 `dark:prose-invert`

**改动文件**：
- `components/admin/PostEditor.tsx` — 添加 dark:prose-invert

## 不在范围内

- 不修改 tagline 数据库记录（已存在的保留）
- 不新增博客副标题后台设置（用户决定保持硬编码）
- 不修改项目页面副标题（用户说固定编码就好）
