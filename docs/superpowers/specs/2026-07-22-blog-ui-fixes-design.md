# 博客 UI/UX 修复设计

日期：2026-07-22

## 概述

修复博客页面两个体验问题：卡片高度不一致、详情页缺少返回入口。

## 问题1：博客卡片高度不一致

**现状**：BlogCard 和 RecentPosts 中的卡片使用 `border + p-5` 布局，内容长度不同导致同行卡片底部不对齐。

**方案**：
- `<article>` 添加 `flex flex-col h-full` 使卡片撑满 Grid 单元格高度
- 日期/阅读时间区域添加 `mt-auto` 固定到底部
- 标题已有 `line-clamp-2`，摘要已有 `line-clamp-2`，无需改动

**改动文件**：
- `components/blog/BlogCard.tsx` — article 添加 flex 布局，日期区域 mt-auto
- `components/home/RecentPosts.tsx` — 同上（内联卡片样式）

## 问题2：博客详情页缺少返回入口

**现状**：详情页只有顶部 Navbar 导航，没有明确的返回链接。

**方案**：
- 在文章标题上方添加「← 返回博客」链接
- 使用 `Link` 组件（来自 `@/i18n/navigation`），指向 `/blog`
- 样式：小字号 `text-sm`，灰色 `text-muted-foreground`，hover 变亮 `hover:text-foreground`
- 添加 `backLink` 翻译 key 到 zh.json / en.json

**改动文件**：
- `app/[locale]/blog/[slug]/page.tsx` — 标题上方添加返回链接
- `messages/zh.json` — blog 部分添加 `backLink`
- `messages/en.json` — blog 部分添加 `backLink`

## 不在范围内

- 不添加 Breadcrumb
- 不修改 Grid 列数
- 不增加阴影或复杂装饰
