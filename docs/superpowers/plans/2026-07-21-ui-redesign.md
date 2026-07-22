# 网站UI重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将暖色文艺风格重构为冷色极简开发者风格，新增国际化、博客搜索、Todo分区、密码登录等功能

**Architecture:** 设计系统先行，逐层替换。先建立OKLCH色彩+Geist字体的新设计系统，再引入next-intl国际化，最后逐页面重构

**Tech Stack:** Next.js 16 (App Router) + Tailwind CSS v4 + shadcn/ui base-nova + @base-ui/react + next-intl + Prisma 7 + Tiptap

## Global Constraints

- 颜色系统使用 OKLCH 色彩空间，chroma=0 纯中性色
- 字体：Geist Sans + Geist Mono，中文回退 PingFang SC / Microsoft YaHei
- 删除所有暖色变量（--paper, --ink, --ink-muted, --accent-hover, --line）
- 边框统一 50% 透明度，hover 变 100%
- 容器宽度：主内容 max-w-5xl (1024px)，文章 max-w-3xl (768px)
- 圆角基准 --radius: 0.625rem
- 过渡统一 transition-colors 150ms ease
- 保留猫按钮 motion 动画，删除 Hero 入场动画
- Admin 后台不参与国际化，保持中文
- output: "standalone" 模式，Docker 部署
- 数据库使用 prisma db push，只加字段不删数据

---

## File Structure

### 新建文件

```
app/[locale]/layout.tsx              # 前台国际化布局
app/[locale]/page.tsx                # 首页
app/[locale]/blog/page.tsx           # 博客列表
app/[locale]/blog/[slug]/page.tsx    # 博客详情
app/[locale]/projects/page.tsx       # 项目列表
app/[locale]/projects/[slug]/page.tsx # 项目详情
app/[locale]/about/page.tsx          # 关于
messages/zh.json                     # 中文翻译
messages/en.json                     # 英文翻译
middleware.ts                        # next-intl 中间件
i18n/request.ts                      # next-intl 配置
i18n/routing.ts                      # 路由配置
components/blog/BlogCard.tsx         # 博客卡片
components/blog/TableOfContents.tsx  # 目录
components/blog/SearchInput.tsx      # 搜索框
components/blog/CodeBlock.tsx        # 代码块
components/blog/Callout.tsx          # 提示框
components/blog/Lightbox.tsx         # 灯箱
components/home/LatestProjects.tsx   # 最新项目
components/layout/LanguageToggle.tsx # 语言切换
components/layout/MobileMenu.tsx     # 移动端菜单
components/admin/TodoGroupManager.tsx # Todo分区管理
```

### 修改文件

```
app/globals.css                      # 重写色彩+字体系统
app/layout.tsx                       # 简化为根布局
app/admin/layout.tsx                 # 适配新色系
app/admin/todos/page.tsx             # 增加分区功能
app/api/auth/login/route.ts          # 仅密码登录
lib/auth/service.ts                  # 仅密码验证
lib/auth/repository.ts               # 查询调整
components/auth/CatButton.tsx        # 密码登录对话框
components/auth/LoginDialog.tsx      # 简化为密码输入
components/layout/Header.tsx         # 完整导航+语言切换
components/layout/Footer.tsx         # 适配新色系
components/layout/Container.tsx      # 调整宽度
components/home/HeroSection.tsx      # 去动画+新风格
components/home/RecentPosts.tsx      # 新卡片风格
components/blog/PostContent.tsx      # 新Markdown样式
components/admin/AdminSidebar.tsx    # 适配新色系
components/admin/PostsTable.tsx      # 适配新色系
components/admin/PostEditor.tsx      # 适配新色系
components/admin/TodoList.tsx        # 增加分区
components/ui/*.tsx                  # 重新生成适配新色系
next.config.ts                       # 添加 next-intl 插件
prisma/seed.ts                       # 添加 Todo 分区种子数据
```

### 删除文件

```
app/page.tsx                         # 移到 [locale]/page.tsx
app/blog/page.tsx                    # 移到 [locale]/blog/page.tsx
app/blog/[slug]/page.tsx             # 移到 [locale]/blog/[slug]/page.tsx
components/home/ContactSection.tsx   # 合并到关于页
```

---

### Task 1: 重写设计系统（颜色+字体+基础规范）

**Files:**
- Modify: `app/globals.css`

**Interfaces:**
- Produces: 所有 CSS 变量（--background, --foreground, --muted, --border 等）的新值，后续所有组件依赖这些变量

- [ ] **Step 1: 重写 globals.css 的 @theme inline 和 :root / .dark 变量**

将暖色系统替换为 OKLCH 中性色系统。完整替换 `app/globals.css` 中的主题定义部分：

```css
/* @theme inline 中的变量替换为： */
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --font-sans: "Geist Sans", "PingFang SC", "Microsoft YaHei", sans-serif;
  --font-mono: "Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
}
```

`:root` 变量替换为：

```css
:root {
  --radius: 0.625rem;
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.145 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.145 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.145 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --destructive-foreground: oklch(0.985 0 0);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  --chart-1: oklch(0.646 0 0);
  --chart-2: oklch(0.6 0 0);
  --chart-3: oklch(0.556 0 0);
  --chart-4: oklch(0.496 0 0);
  --chart-5: oklch(0.422 0 0);
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.145 0 0);
  --sidebar-primary: oklch(0.145 0 0);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.97 0 0);
  --sidebar-accent-foreground: oklch(0.145 0 0);
  --sidebar-border: oklch(0.922 0 0);
  --sidebar-ring: oklch(0.708 0 0);
}
```

`.dark` 变量替换为：

```css
.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.145 0 0);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.145 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.985 0 0);
  --primary-foreground: oklch(0.145 0 0);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.269 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --destructive-foreground: oklch(0.985 0 0);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 10%);
  --ring: oklch(0.708 0 0);
  --chart-1: oklch(0.8 0 0);
  --chart-2: oklch(0.7 0 0);
  --chart-3: oklch(0.6 0 0);
  --chart-4: oklch(0.5 0 0);
  --chart-5: oklch(0.4 0 0);
  --sidebar: oklch(0.145 0 0);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.985 0 0);
  --sidebar-primary-foreground: oklch(0.145 0 0);
  --sidebar-accent: oklch(0.269 0 0);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.708 0 0);
}
```

删除所有暖色变量（--paper, --ink, --ink-muted, --accent-hover, --line）及其引用。

- [ ] **Step 2: 更新全局样式规则**

删除所有引用暖色变量的样式规则，替换为使用 shadcn 语义色变量。关键替换：
- `bg-[var(--paper)]` → `bg-background`
- `text-[var(--ink)]` → `text-foreground`
- `text-[var(--ink-muted)]` → `text-muted-foreground`
- `border-[var(--line)]` → `border-border/50`
- `hover:text-[var(--accent-hover)]` → `hover:text-foreground`
- `bg-[var(--accent)]` → `bg-primary`

更新 body 样式：字号 16px (1rem)，行高 1.75，font-sans。
更新 h1-h4 样式：全部 font-sans（不再用 font-serif），font-weight 700/600。
更新选区高亮：背景 primary，文字 primary-foreground。
更新滚动条：使用 border 色。

- [ ] **Step 3: 更新 layout.tsx 字体引入**

将 Google Fonts link 从 Noto Sans SC / Noto Serif SC 替换为 Geist Sans + Geist Mono：

```tsx
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
<link href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500&family=Geist:wght@400;500;600;700&display=swap" rel="stylesheet" />
```

- [ ] **Step 4: 验证开发服务器启动**

Run: `npm run dev`
Expected: 页面显示黑白灰色系，Geist 字体生效，无暖色残留

- [ ] **Step 5: Commit**

```bash
git add app/globals.css app/layout.tsx
git commit -m "refactor: redesign color system to OKLCH neutral + Geist fonts"
```

---

### Task 2: 重新生成 shadcn/ui 组件适配新色系

**Files:**
- Modify: `components/ui/button.tsx`
- Modify: `components/ui/card.tsx`
- Modify: `components/ui/badge.tsx`
- Modify: `components/ui/input.tsx`
- Modify: `components/ui/dialog.tsx`
- Modify: `components/ui/tabs.tsx`
- Modify: `components/ui/select.tsx`
- Modify: `components/ui/textarea.tsx`
- Modify: `components/ui/label.tsx`
- Modify: `components/ui/separator.tsx`
- Modify: `components/ui/dropdown-menu.tsx`

**Interfaces:**
- Consumes: Task 1 的新 CSS 变量
- Produces: 所有 UI 组件使用新色系，后续页面组件依赖这些

- [ ] **Step 1: 重新生成所有 shadcn/ui 组件**

Run: `npx shadcn@latest add button card badge input dialog tabs select textarea label separator dropdown-menu --overwrite`

这会基于 base-nova 风格和新的 CSS 变量重新生成所有组件。

- [ ] **Step 2: 手动修复 button.tsx 中的 color-mix**

检查 button.tsx secondary variant 中是否有 `color-mix(in_oklch,...)` 调用，确保与新色系兼容。如果存在，替换为 `hover:bg-muted`。

- [ ] **Step 3: 验证组件渲染**

Run: `npm run dev`
Expected: 所有 UI 组件显示黑白灰色系，按钮/卡片/输入框等样式正确

- [ ] **Step 4: Commit**

```bash
git add components/ui/
git commit -m "refactor: regenerate shadcn/ui components for new color system"
```

---

### Task 3: 引入 next-intl 国际化

**Files:**
- Create: `i18n/request.ts`
- Create: `i18n/routing.ts`
- Create: `messages/zh.json`
- Create: `messages/en.json`
- Create: `middleware.ts`
- Modify: `next.config.ts`

**Interfaces:**
- Produces: `useTranslations()` hook, `getLocale()` 函数, `[locale]` 路由参数, 翻译 key 体系。后续所有前台页面依赖这些

- [ ] **Step 1: 安装 next-intl**

Run: `npm install next-intl`

- [ ] **Step 2: 创建 i18n/routing.ts**

```typescript
import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['zh', 'en'],
  defaultLocale: 'zh',
});
```

- [ ] **Step 3: 创建 i18n/request.ts**

```typescript
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  if (!locale || !routing.locales.includes(locale as any)) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
```

- [ ] **Step 4: 创建 messages/zh.json**

```json
{
  "nav": {
    "home": "首页",
    "blog": "博客",
    "projects": "项目",
    "about": "关于",
    "github": "GitHub"
  },
  "home": {
    "title": "欢迎",
    "description": "记录思考、项目和对现代 Web 开发的探索。",
    "readBlog": "阅读博客",
    "viewProjects": "查看项目",
    "latestPosts": "最新文章",
    "viewAll": "查看全部",
    "latestProjects": "最新项目"
  },
  "blog": {
    "title": "博客",
    "description": "关于 Web 开发、设计和技术的思考。",
    "search": "搜索文章...",
    "all": "全部",
    "readMore": "阅读更多",
    "minuteRead": "{count}分钟阅读"
  },
  "projects": {
    "title": "项目",
    "description": "个人项目和开源作品的集合。",
    "demo": "在线演示",
    "source": "源码"
  },
  "about": {
    "title": "关于",
    "description": "你好，我是一名热爱构建 Web 应用的开发者。",
    "whatIDo": "我做什么",
    "techStack": "技术栈",
    "contact": "联系方式"
  },
  "footer": {
    "copyright": "© {year} QZ Site. All rights reserved."
  }
}
```

- [ ] **Step 5: 创建 messages/en.json**

```json
{
  "nav": {
    "home": "Home",
    "blog": "Blog",
    "projects": "Projects",
    "about": "About",
    "github": "GitHub"
  },
  "home": {
    "title": "Welcome",
    "description": "Thoughts, projects, and explorations in modern Web development.",
    "readBlog": "Read Blog",
    "viewProjects": "View Projects",
    "latestPosts": "Latest Posts",
    "viewAll": "View All",
    "latestProjects": "Latest Projects"
  },
  "blog": {
    "title": "Blog",
    "description": "Thoughts on web development, design, and technology.",
    "search": "Search articles...",
    "all": "All",
    "readMore": "Read more",
    "minuteRead": "{count} min read"
  },
  "projects": {
    "title": "Projects",
    "description": "A collection of personal and open-source projects.",
    "demo": "Live Demo",
    "source": "Source"
  },
  "about": {
    "title": "About",
    "description": "Hi, I'm a developer who loves building web applications.",
    "whatIDo": "What I Do",
    "techStack": "Tech Stack",
    "contact": "Contact"
  },
  "footer": {
    "copyright": "© {year} QZ Site. All rights reserved."
  }
}
```

- [ ] **Step 6: 创建 middleware.ts**

```typescript
import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  matcher: ['/', '/(zh|en)/:path*'],
};
```

- [ ] **Step 7: 更新 next.config.ts**

```typescript
import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

export default withNextIntl(nextConfig);
```

- [ ] **Step 8: 验证中间件重定向**

Run: `npm run dev`
访问 `http://localhost:3000` → 应重定向到 `http://localhost:3000/zh`
访问 `http://localhost:3000/en` → 应显示英文

- [ ] **Step 9: Commit**

```bash
git add i18n/ messages/ middleware.ts next.config.ts package.json package-lock.json
git commit -m "feat: add next-intl internationalization with zh/en support"
```

---

### Task 4: 迁移路由到 [locale] 结构

**Files:**
- Create: `app/[locale]/layout.tsx`
- Create: `app/[locale]/page.tsx`
- Modify: `app/layout.tsx` (简化为根布局)
- Delete: `app/page.tsx` (移到 [locale])
- Delete: `app/blog/page.tsx` (移到 [locale]/blog)
- Delete: `app/blog/[slug]/page.tsx` (移到 [locale]/blog/[slug])

**Interfaces:**
- Consumes: Task 3 的 next-intl 配置
- Produces: [locale] 路由结构，后续所有前台页面在此结构下创建

- [ ] **Step 1: 简化 app/layout.tsx 为根布局**

根布局只负责 HTML 骨架和字体，不包含 Header/Footer：

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "QZ Site",
  description: "个人博客与知识管理",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="antialiased" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500&family=Geist:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})()
        `}} />
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 2: 创建 app/[locale]/layout.tsx**

前台布局包含 Header + main + Footer + CatButton，使用 next-intl 的 NextIntlClientProvider：

```tsx
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { CatButton } from "@/components/auth/CatButton";

export default async function LocaleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <NextIntlClientProvider messages={messages}>
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
      <CatButton />
    </NextIntlClientProvider>
  );
}
```

- [ ] **Step 3: 移动 app/page.tsx → app/[locale]/page.tsx**

将现有首页内容移到 `app/[locale]/page.tsx`，暂时保持原有组件引用不变（后续 Task 重写组件）。

- [ ] **Step 4: 移动 app/blog/ → app/[locale]/blog/**

将 `app/blog/page.tsx` 移到 `app/[locale]/blog/page.tsx`
将 `app/blog/[slug]/page.tsx` 移到 `app/[locale]/blog/[slug]/page.tsx`

- [ ] **Step 5: 删除旧路由文件**

删除 `app/page.tsx`、`app/blog/page.tsx`、`app/blog/[slug]/page.tsx`

- [ ] **Step 6: 验证路由重定向和页面渲染**

Run: `npm run dev`
访问 `http://localhost:3000` → 重定向到 `/zh` → 显示首页
访问 `http://localhost:3000/en` → 显示英文版首页
访问 `http://localhost:3000/zh/blog` → 显示博客列表

- [ ] **Step 7: Commit**

```bash
git add app/ -A
git commit -m "refactor: migrate routes to [locale] structure for i18n"
```

---

### Task 5: 重写 Header 导航

**Files:**
- Modify: `components/layout/Header.tsx`
- Create: `components/layout/LanguageToggle.tsx`
- Create: `components/layout/MobileMenu.tsx`

**Interfaces:**
- Consumes: Task 3 的 `useTranslations()`, Task 4 的 `[locale]` 路由
- Produces: 完整导航栏组件，所有前台页面使用

- [ ] **Step 1: 创建 LanguageToggle.tsx**

```tsx
'use client';

import { useLocale } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import { Languages } from 'lucide-react';

export function LanguageToggle() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  const toggleLocale = () => {
    const nextLocale = locale === 'zh' ? 'en' : 'zh';
    const segments = pathname.split('/');
    segments[1] = nextLocale;
    router.replace(segments.join('/'));
  };

  return (
    <button
      onClick={toggleLocale}
      className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
      aria-label="Toggle language"
    >
      <Languages className="size-4" />
    </button>
  );
}
```

- [ ] **Step 2: 创建 MobileMenu.tsx**

移动端汉堡菜单，sm 以下显示：

```tsx
'use client';

import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import { usePathname } from 'next/navigation';

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const t = useTranslations('nav');
  const locale = useLocale();
  const pathname = usePathname();

  const links = [
    { href: `/${locale}`, label: t('home') },
    { href: `/${locale}/blog`, label: t('blog') },
    { href: `/${locale}/projects`, label: t('projects') },
    { href: `/${locale}/about`, label: t('about') },
  ];

  const isActive = (href: string) => {
    if (href === `/${locale}`) return pathname === `/${locale}` || pathname === `/${locale}/`;
    return pathname.startsWith(href);
  };

  return (
    <div className="sm:hidden">
      <button
        onClick={() => setOpen(!open)}
        className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        {open ? <X className="size-4" /> : <Menu className="size-4" />}
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-14 border-t border-border/50 bg-background/95 backdrop-blur-md p-4 space-y-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className={`block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive(link.href)
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 重写 Header.tsx**

完整导航栏：Logo + 导航链接 + GitHub/EN/Theme 图标按钮，毛玻璃效果：

```tsx
'use client';

import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { usePathname } from 'next/navigation';
import { Github } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { LanguageToggle } from './LanguageToggle';
import { MobileMenu } from './MobileMenu';

export function Header() {
  const t = useTranslations('nav');
  const locale = useLocale();
  const pathname = usePathname();

  const links = [
    { href: `/${locale}`, label: t('home') },
    { href: `/${locale}/blog`, label: t('blog') },
    { href: `/${locale}/projects`, label: t('projects') },
    { href: `/${locale}/about`, label: t('about') },
  ];

  const isActive = (href: string) => {
    if (href === `/${locale}`) return pathname === `/${locale}` || pathname === `/${locale}/`;
    return pathname.startsWith(href);
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link href={`/${locale}`} className="text-sm font-semibold tracking-tight hover:opacity-80 transition-opacity">
          QZ Site
        </Link>

        <nav className="hidden sm:flex items-center gap-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive(link.href)
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          <a
            href="https://github.com/666666999999666"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <Github className="size-4" />
          </a>
          <LanguageToggle />
          <ThemeToggle />
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 4: 更新 ThemeToggle.tsx 适配新色系**

确保 ThemeToggle 使用 `rounded-md p-1.5 text-muted-foreground hover:bg-accent` 样式，与导航图标按钮一致。

- [ ] **Step 5: 验证导航栏**

Run: `npm run dev`
Expected: 导航栏显示完整链接，毛玻璃效果，语言切换正常，移动端汉堡菜单正常

- [ ] **Step 6: Commit**

```bash
git add components/layout/Header.tsx components/layout/LanguageToggle.tsx components/layout/MobileMenu.tsx components/layout/ThemeToggle.tsx
git commit -m "feat: rewrite Header with full navigation, language toggle, mobile menu"
```

---

### Task 6: 重写首页

**Files:**
- Modify: `app/[locale]/page.tsx`
- Modify: `components/home/HeroSection.tsx`
- Modify: `components/home/RecentPosts.tsx`
- Create: `components/home/LatestProjects.tsx`
- Modify: `components/layout/Container.tsx`
- Modify: `components/layout/Footer.tsx`
- Delete: `components/home/ContactSection.tsx`

**Interfaces:**
- Consumes: Task 1 新色系, Task 3 翻译, Task 5 Header
- Produces: 首页完整布局

- [ ] **Step 1: 更新 Container.tsx 宽度**

将默认宽度从 920px 改为 1024px (max-w-5xl)，narrow 从 720px 改为 768px (max-w-3xl)：

```tsx
export function Container({ children, size = 'default', className }: Props) {
  const sizeClasses = {
    narrow: 'max-w-3xl',   // 768px
    default: 'max-w-5xl',  // 1024px
    wide: 'max-w-5xl',     // 1024px (统一)
  };
  // ...
}
```

- [ ] **Step 2: 重写 HeroSection.tsx**

去掉 motion 入场动画，静态呈现，新色系：

```tsx
'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import { ArrowRight } from 'lucide-react';

export function HeroSection() {
  const t = useTranslations('home');
  const locale = useLocale();

  return (
    <section className="py-24 sm:py-36">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 text-center">
        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-foreground">
          {t('title')}
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          {t('description')}
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href={`/${locale}/blog`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 h-9 text-sm font-medium text-primary-foreground hover:bg-primary/80 active:translate-y-px transition-colors"
          >
            {t('readBlog')}
            <ArrowRight className="size-3.5" />
          </Link>
          <Link
            href={`/${locale}/projects`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-4 h-9 text-sm font-medium text-foreground hover:bg-muted active:translate-y-px transition-colors"
          >
            {t('viewProjects')}
          </Link>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: 重写 RecentPosts.tsx**

新卡片风格，3列网格，hover 三层反馈：

```tsx
'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import { ArrowRight, Calendar, Clock } from 'lucide-react';

interface Post {
  id: string;
  title: string;
  excerpt?: string;
  slug: string;
  category?: { name: string };
  createdAt: string;
  readingTime?: number;
}

export function RecentPosts({ posts }: { posts: Post[] }) {
  const t = useTranslations('home');
  const locale = useLocale();

  return (
    <section className="py-16">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-semibold tracking-tight">{t('latestPosts')}</h2>
          <Link href={`/${locale}/blog`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            {t('viewAll')}
            <ArrowRight className="size-3" />
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {posts.map((post) => (
            <Link key={post.id} href={`/${locale}/blog/${post.slug}`} className="group rounded-lg border border-border/50 p-5 hover:border-border hover:bg-muted/50 transition-colors">
              {post.category && (
                <span className="text-xs uppercase tracking-wider text-muted-foreground">{post.category.name}</span>
              )}
              <h3 className="mt-1 font-semibold leading-snug group-hover:text-foreground transition-colors">{post.title}</h3>
              {post.excerpt && (
                <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{post.excerpt}</p>
              )}
              <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Calendar className="size-3" />{new Date(post.createdAt).toLocaleDateString('zh-CN')}</span>
                {post.readingTime && <span className="inline-flex items-center gap-1"><Clock className="size-3" />{post.readingTime}分钟</span>}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: 创建 LatestProjects.tsx**

项目卡片组件，2列网格：

```tsx
'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';

interface Project {
  id: string;
  title: string;
  description?: string;
  tags?: string[];
  demoUrl?: string;
}

export function LatestProjects({ projects }: { projects: Project[] }) {
  const t = useTranslations('home');

  return (
    <section className="py-16">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight mb-8">{t('latestProjects')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {projects.map((project) => (
            <div key={project.id} className="group rounded-lg border border-border/50 p-6 hover:border-border hover:bg-muted/30 transition-colors">
              <h3 className="font-semibold leading-snug group-hover:text-foreground transition-colors">{project.title}</h3>
              {project.description && (
                <p className="mt-1.5 text-sm text-muted-foreground line-clamp-2">{project.description}</p>
              )}
              {project.tags && project.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {project.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">{tag}</span>
                  ))}
                </div>
              )}
              {project.demoUrl && (
                <a href={project.demoUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-foreground text-background px-4 py-1.5 text-sm font-medium hover:opacity-90 transition-opacity">
                  Demo <ExternalLink className="size-3" />
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: 更新 Footer.tsx 适配新色系**

使用 `text-muted-foreground` 和 `border-border/50`，添加 `useTranslations`。

- [ ] **Step 6: 更新 app/[locale]/page.tsx**

组合 HeroSection + RecentPosts + LatestProjects，删除 ContactSection 引用。

- [ ] **Step 7: 删除 ContactSection.tsx**

联系方式信息合并到关于页。

- [ ] **Step 8: 验证首页**

Run: `npm run dev`
Expected: 首页显示黑白灰风格，Hero无动画，文章3列网格，项目2列网格

- [ ] **Step 9: Commit**

```bash
git add app/[locale]/page.tsx components/home/ components/layout/Container.tsx components/layout/Footer.tsx
git commit -m "feat: rewrite homepage with new design system"
```

---

### Task 7: 重写博客列表页 + 搜索功能

**Files:**
- Modify: `app/[locale]/blog/page.tsx`
- Create: `components/blog/BlogCard.tsx`
- Create: `components/blog/SearchInput.tsx`
- Modify: `app/api/posts/route.ts` (添加搜索参数)

**Interfaces:**
- Consumes: Task 1 新色系, Task 3 翻译
- Produces: 博客列表页 + 搜索功能

- [ ] **Step 1: 创建 SearchInput.tsx**

搜索框组件，左侧搜索图标，右侧清除按钮：

```tsx
'use client';

import { Search, X } from 'lucide-react';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchInput({ value, onChange, placeholder }: SearchInputProps) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-border/50 bg-background pl-10 pr-10 text-sm placeholder:text-muted-foreground/60 focus:ring-1 focus:ring-ring focus:border-border transition-colors"
      />
      {value && (
        <button onClick={() => onChange('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 创建 BlogCard.tsx**

博客卡片组件，hover 三层反馈：

```tsx
import Link from 'next/link';
import { Calendar, Clock } from 'lucide-react';

interface BlogCardProps {
  slug: string;
  locale: string;
  title: string;
  excerpt?: string;
  category?: { name: string };
  createdAt: string;
  readingTime?: number;
}

export function BlogCard({ slug, locale, title, excerpt, category, createdAt, readingTime }: BlogCardProps) {
  return (
    <Link href={`/${locale}/blog/${slug}`} className="group block rounded-lg border border-border/50 p-5 hover:border-border hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {category && <span className="uppercase tracking-wider">{category.name}</span>}
        <span className="inline-flex items-center gap-1"><Calendar className="size-3" />{new Date(createdAt).toLocaleDateString('zh-CN')}</span>
        {readingTime && <span className="inline-flex items-center gap-1"><Clock className="size-3" />{readingTime}分钟</span>}
      </div>
      <h2 className="mt-2 font-semibold leading-snug group-hover:text-foreground transition-colors">{title}</h2>
      {excerpt && <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{excerpt}</p>}
    </Link>
  );
}
```

- [ ] **Step 3: 修改 API 路由添加搜索支持**

在 `app/api/posts/route.ts` 的 GET handler 中添加 `search` 查询参数，搜索 title 和 content：

```typescript
// 在 GET handler 中添加
const search = url.searchParams.get('search');
if (search) {
  where.OR = [
    { title: { contains: search, mode: 'insensitive' } },
    { content: { contains: search, mode: 'insensitive' } },
  ];
}
```

- [ ] **Step 4: 重写 app/[locale]/blog/page.tsx**

页面标题 + 描述 + 分类 Tabs + 搜索框 + 文章列表：

```tsx
import { getTranslations, getLocale } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { BlogCard } from '@/components/blog/BlogCard';
import { SearchInput } from '@/components/blog/SearchInput';
import { CategoryTabs } from '@/components/blog/CategoryTabs';

export default async function BlogPage({ searchParams }: { searchParams: { category?: string; search?: string } }) {
  const t = await getTranslations('blog');
  const locale = await getLocale();

  const where: any = { status: 'PUBLISHED' };
  if (searchParams.category) where.categoryId = searchParams.category;
  if (searchParams.search) {
    where.OR = [
      { title: { contains: searchParams.search, mode: 'insensitive' } },
      { content: { contains: searchParams.search, mode: 'insensitive' } },
    ];
  }

  const [posts, categories] = await Promise.all([
    prisma.post.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { category: true },
    }),
    prisma.category.findMany({ where: { type: 'BLOG' } }),
  ]);

  return (
    <div className="py-16">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{t('title')}</h1>
        <p className="mt-2 text-muted-foreground">{t('description')}</p>

        <div className="mt-6 space-y-3 border-b border-border/50 pb-4">
          <CategoryTabs categories={categories} activeId={searchParams.category} locale={locale} />
          <SearchInput placeholder={t('search')} />
        </div>

        <div className="mt-8 space-y-6">
          {posts.map((post) => (
            <BlogCard key={post.id} locale={locale} {...post} slug={post.id} />
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 验证博客列表页**

Run: `npm run dev`
访问 `/zh/blog` → 显示文章列表，分类筛选，搜索框

- [ ] **Step 6: Commit**

```bash
git add app/[locale]/blog/ components/blog/BlogCard.tsx components/blog/SearchInput.tsx app/api/posts/route.ts
git commit -m "feat: rewrite blog list page with search and category filtering"
```

---

### Task 8: 重写博客详情页 + TOC + Markdown 样式

**Files:**
- Modify: `app/[locale]/blog/[slug]/page.tsx`
- Create: `components/blog/TableOfContents.tsx`
- Create: `components/blog/CodeBlock.tsx`
- Create: `components/blog/Callout.tsx`
- Create: `components/blog/Lightbox.tsx`
- Modify: `components/blog/PostContent.tsx`

**Interfaces:**
- Consumes: Task 1 新色系
- Produces: 博客详情页 + TOC + 代码块 + 提示框 + 灯箱

- [ ] **Step 1: 创建 TableOfContents.tsx**

使用 IntersectionObserver 追踪当前阅读位置，sticky top-20，仅 lg 以上显示：

```tsx
'use client';

import { useEffect, useState } from 'react';

interface Heading {
  id: string;
  text: string;
  level: number;
}

export function TableOfContents({ headings }: { headings: Heading[] }) {
  const [activeId, setActiveId] = useState<string>('');

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveId(entry.target.id);
        });
      },
      { rootMargin: '-80px 0px -80% 0px' }
    );

    headings.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [headings]);

  return (
    <nav className="hidden lg:block sticky top-20">
      <h4 className="text-sm font-semibold mb-3">目录</h4>
      <ul className="space-y-1">
        {headings.map(({ id, text, level }) => (
          <li key={id} className={level === 3 ? 'pl-4' : ''}>
            <a
              href={`#${id}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
              }}
              className={`text-sm py-1 transition-colors ${
                activeId === id ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 2: 创建 CodeBlock.tsx**

代码块组件，zinc-950 背景，标题栏，行号，复制按钮：

```tsx
'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface CodeBlockProps {
  language?: string;
  code: string;
}

export function CodeBlock({ language, code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lines = code.split('\n');

  return (
    <div className="rounded-lg border border-border overflow-hidden my-4">
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-950 dark:bg-zinc-900 px-4 py-2">
        <span className="text-xs font-medium text-zinc-400">{language || 'code'}</span>
        <button onClick={copy} className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors inline-flex items-center gap-1">
          {copied ? <><Check className="size-3" /> Copied</> : <><Copy className="size-3" /> Copy</>}
        </button>
      </div>
      <div className="relative bg-zinc-950 dark:bg-zinc-900 py-4 pl-12 pr-4 overflow-x-auto">
        {lines.map((line, i) => (
          <div key={i} className="leading-6">
            <span className="absolute left-0 w-10 text-right text-xs leading-6 text-zinc-600 select-none">{i + 1}</span>
            <code className="text-sm text-zinc-200">{line}</code>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 创建 Callout.tsx**

4种类型提示框：

```tsx
import { Info, AlertTriangle, AlertCircle, Lightbulb } from 'lucide-react';

const variants = {
  tip: { border: 'border-emerald-500/30', bg: 'bg-emerald-500/5', text: 'text-emerald-600 dark:text-emerald-400', icon: Lightbulb },
  info: { border: 'border-blue-500/30', bg: 'bg-blue-500/5', text: 'text-blue-600 dark:text-blue-400', icon: Info },
  warning: { border: 'border-amber-500/30', bg: 'bg-amber-500/5', text: 'text-amber-600 dark:text-amber-400', icon: AlertTriangle },
  danger: { border: 'border-red-500/30', bg: 'bg-red-500/5', text: 'text-red-600 dark:text-red-400', icon: AlertCircle },
};

type Variant = keyof typeof variants;

interface CalloutProps {
  variant?: Variant;
  title?: string;
  children: React.ReactNode;
}

export function Callout({ variant = 'info', title, children }: CalloutProps) {
  const v = variants[variant];
  const Icon = v.icon;

  return (
    <div className={`rounded-lg border ${v.border} ${v.bg} p-4 my-4`}>
      {title && (
        <div className={`flex items-center gap-2 font-semibold text-sm ${v.text} mb-1`}>
          <Icon className="size-4" />
          {title}
        </div>
      )}
      <div className="text-sm">{children}</div>
    </div>
  );
}
```

- [ ] **Step 4: 创建 Lightbox.tsx**

图片灯箱，ESC/点击关闭，滚动锁定：

```tsx
'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

export function Lightbox() {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLImageElement;
      if (target.tagName === 'IMG' && target.classList.contains('cursor-zoom-in')) {
        setSrc(target.src);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSrc(null);
    };

    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    document.body.style.overflow = src ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [src]);

  if (!src) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm" onClick={() => setSrc(null)}>
      <button className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors" onClick={() => setSrc(null)}>
        <X className="size-5" />
      </button>
      <img src={src} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 max-h-[85vh] max-w-[90vw] rounded-lg object-contain shadow-2xl" />
    </div>
  );
}
```

- [ ] **Step 5: 更新 PostContent.tsx**

使用 prose-neutral 样式，图片添加 cursor-zoom-in：

```tsx
// 在 prose 容器上添加类名
// prose prose-neutral dark:prose-invert max-w-none
// 图片添加 cursor-zoom-in class
// 引入 Lightbox 组件
```

- [ ] **Step 6: 重写 app/[locale]/blog/[slug]/page.tsx/[slug]/page.tsx**

两栏布局：内容(max-w-3xl) + TOC(w-56)：

```tsx
import { prisma } from '@/lib/db';
import { PostContent } from '@/components/blog/PostContent';
import { TableOfContents } from '@/components/blog/TableOfContents';
import { Calendar, Clock, Tag } from 'lucide-react';
import { notFound } from 'next/navigation';

export default async function BlogPostPage({ params }: { params: { slug: string } }) {
  const post = await prisma.post.findUnique({
    where: { id: params.slug },
    include: { category: true },
  });

  if (!post) notFound();

  // 从内容中提取 headings
  const headings = extractHeadings(post.content);

  return (
    <div className="py-12">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="flex gap-8">
          <article className="max-w-3xl">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              {post.category && <span>{post.category.name}</span>}
              <span className="inline-flex items-center gap-1"><Calendar className="size-3.5" />{new Date(post.createdAt).toLocaleDateString('zh-CN')}</span>
            </div>
            <h1 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight">{post.title}</h1>
            <div className="mt-8">
              <PostContent content={post.content} />
            </div>
            <div className="mt-16 border-t border-border/50 pt-6" />
          </article>
          <aside className="hidden lg:block w-56 shrink-0">
            <TableOfContents headings={headings} />
          </aside>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: 验证博客详情页**

Run: `npm run dev`
访问 `/zh/blog/[slug]` → 显示文章 + TOC，代码块样式正确

- [ ] **Step 8: Commit**

```bash
git add app/[locale]/blog/ components/blog/
git commit -m "feat: rewrite blog detail page with TOC, code block, callout, lightbox"
```

---

### Task 9: 创建项目页 + 关于页

**Files:**
- Create: `app/[locale]/projects/page.tsx`
- Create: `app/[locale]/projects/[slug]/page.tsx`
- Create: `app/[locale]/about/page.tsx`

**Interfaces:**
- Consumes: Task 1 新色系, Task 3 翻译
- Produces: 项目列表/详情页 + 关于页

- [ ] **Step 1: 创建 app/[locale]/projects/page.tsx**

项目列表页，两列网格，卡片风格同设计文档 §6：

```tsx
import { getTranslations, getLocale } from 'next-intl/server';
import { Github, ExternalLink } from 'lucide-react';

export default async function ProjectsPage() {
  const t = await getTranslations('projects');
  const locale = await getLocale();

  // 项目数据暂时硬编码，后续可从数据库获取
  const projects = [
    { id: '1', title: 'QZ Site', description: '个人博客与知识管理网站', tags: ['Next.js', 'TypeScript', 'Prisma'], demoUrl: 'https://example.com', sourceUrl: 'https://github.com/666666999999666' },
  ];

  return (
    <div className="py-16">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{t('title')}</h1>
        <p className="mt-2 text-muted-foreground">{t('description')}</p>
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-6">
          {projects.map((project) => (
            <div key={project.id} className="group rounded-lg border border-border/50 p-6 hover:border-border hover:bg-muted/30 transition-colors">
              <h2 className="text-lg font-semibold leading-snug group-hover:text-foreground transition-colors">{project.title}</h2>
              <p className="mt-1.5 text-sm text-muted-foreground line-clamp-2">{project.description}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {project.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">{tag}</span>
                ))}
              </div>
              <div className="mt-4 flex gap-3">
                {project.sourceUrl && <a href={project.sourceUrl} target="_blank" className="text-muted-foreground hover:text-foreground transition-colors"><Github className="size-3.5" /></a>}
                {project.demoUrl && <a href={project.demoUrl} target="_blank" className="text-muted-foreground hover:text-foreground transition-colors"><ExternalLink className="size-3.5" /></a>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 创建 app/[locale]/about/page.tsx**

关于页，技能 Tags + 联系方式：

```tsx
import { getTranslations } from 'next-intl/server';
import { Github, Mail } from 'lucide-react';

export default async function AboutPage() {
  const t = await getTranslations('about');

  const skills = ['TypeScript', 'React', 'Next.js', 'Node.js', 'Docker', 'Git', 'Python', 'Rust'];

  return (
    <div className="py-16">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{t('title')}</h1>
        <p className="mt-2 text-muted-foreground">{t('description')}</p>

        <section className="mt-12">
          <h2 className="text-2xl font-semibold tracking-tight">{t('whatIDo')}</h2>
          <h3 className="mt-6 text-lg font-medium">{t('techStack')}</h3>
          <div className="mt-4 flex flex-wrap gap-2">
            {skills.map((skill) => (
              <span key={skill} className="rounded-full bg-muted px-3 py-1 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors cursor-default">{skill}</span>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-semibold tracking-tight">{t('contact')}</h2>
          <div className="mt-4 flex gap-4">
            <a href="https://github.com/666666999999666" target="_blank" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
              <Github className="size-5" /> GitHub
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 验证项目页和关于页**

Run: `npm run dev`
访问 `/zh/projects` → 显示项目列表
访问 `/zh/about` → 显示关于页

- [ ] **Step 4: Commit**

```bash
git add app/[locale]/projects/ app/[locale]/about/
git commit -m "feat: add projects and about pages"
```

---

### Task 10: 认证改造 — 仅密码登录

**Files:**
- Modify: `lib/auth/service.ts`
- Modify: `lib/auth/repository.ts`
- Modify: `app/api/auth/login/route.ts`
- Modify: `components/auth/LoginDialog.tsx`
- Modify: `components/auth/CatButton.tsx`

**Interfaces:**
- Consumes: 现有认证系统
- Produces: 仅密码登录 API + UI

- [ ] **Step 1: 修改 lib/auth/repository.ts**

添加按 ID 查找用户的方法（因为只有一个用户，直接取第一个）：

```typescript
export async function findFirstUser() {
  return prisma.user.findFirst();
}
```

- [ ] **Step 2: 修改 lib/auth/service.ts**

login 函数改为只验证密码：

```typescript
export async function login(password: string, clientIp: string) {
  // IP 限流检查（保留）
  checkRateLimit(clientIp);

  if (!password) {
    throw new ValidationError('密码必填');
  }

  const user = await findFirstUser();
  if (!user) {
    throw new AuthError('用户不存在');
  }

  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) {
    recordFailedAttempt(clientIp);
    throw new AuthError('密码错误');
  }

  clearFailedAttempts(clientIp);
  return { userId: user.id, username: user.username };
}
```

- [ ] **Step 3: 修改 app/api/auth/login/route.ts**

只接收 password 字段：

```typescript
const { password } = await request.json();
const result = await login(password, clientIp);
```

- [ ] **Step 4: 修改 LoginDialog.tsx**

只显示密码输入框，去掉用户名：

```tsx
// 删除 username 输入框
// 只保留 password 输入框
// 表单提交只发送 { password }
```

- [ ] **Step 5: 修改 CatButton.tsx**

确保猫按钮点击后弹出的是密码输入对话框（不需要用户名）。

- [ ] **Step 6: 验证密码登录**

Run: `npm run dev`
点击猫按钮 → 弹出密码框 → 输入密码 → 成功进入后台

- [ ] **Step 7: Commit**

```bash
git add lib/auth/ app/api/auth/login/route.ts components/auth/
git commit -m "feat: change login to password-only authentication"
```

---

### Task 11: Admin 后台适配新色系 + Todo 分区

**Files:**
- Modify: `app/admin/layout.tsx`
- Modify: `components/admin/AdminSidebar.tsx`
- Modify: `components/admin/PostsTable.tsx`
- Modify: `components/admin/PostEditor.tsx`
- Modify: `components/admin/PostForm.tsx`
- Modify: `components/admin/TodoList.tsx`
- Modify: `components/admin/CategoryManager.tsx`
- Modify: `components/admin/SettingsForm.tsx`
- Modify: `components/admin/PasswordForm.tsx`
- Modify: `components/admin/LogoutButton.tsx`
- Create: `components/admin/TodoGroupManager.tsx`
- Modify: `app/admin/todos/page.tsx`
- Modify: `app/api/todos/route.ts`
- Modify: `app/api/categories/route.ts`

**Interfaces:**
- Consumes: Task 1 新色系, Task 10 仅密码登录
- Produces: 适配新色系的 Admin 后台 + Todo 分区功能

- [ ] **Step 1: 更新 admin/layout.tsx 适配新色系**

将暖色变量引用替换为 shadcn 语义色：border-border/50, bg-background, text-foreground 等。

- [ ] **Step 2: 更新 AdminSidebar.tsx 适配新色系**

导航项使用 rounded-md px-3 py-2 text-sm，激活态 bg-accent text-accent-foreground font-medium。

- [ ] **Step 3: 更新 PostsTable.tsx 适配新色系**

表格：rounded-lg border-border/50，表头 bg-muted/50，行悬停 bg-muted/30。
Status Badge：Published 用 emerald-500/10 + emerald-600，Draft 用 amber-500/10 + amber-600。
删除按钮：hover:bg-destructive/10 hover:text-destructive，二次确认。

- [ ] **Step 4: 更新 PostEditor.tsx 适配新色系**

编辑区 font-mono text-sm，预览区 prose prose-neutral。自动保存状态指示器。

- [ ] **Step 5: 创建 TodoGroupManager.tsx**

Todo 分区管理组件，支持创建/删除/重命名分区：

```tsx
'use client';

import { useState } from 'react';
import { Plus, Trash2, Pencil } from 'lucide-react';

interface TodoGroup {
  id: string;
  name: string;
  order: number;
}

interface TodoGroupManagerProps {
  groups: TodoGroup[];
  activeGroupId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

export function TodoGroupManager({ groups, activeGroupId, onSelect, onCreate, onRename, onDelete }: TodoGroupManagerProps) {
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  return (
    <div className="space-y-1">
      <button
        onClick={() => onSelect(null)}
        className={`w-full rounded-md px-3 py-2 text-sm text-left transition-colors ${
          activeGroupId === null ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground hover:bg-accent'
        }`}
      >
        全部
      </button>
      {groups.map((group) => (
        <div key={group.id} className="group flex items-center gap-1">
          {editingId === group.id ? (
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={() => { onRename(group.id, editName); setEditingId(null); }}
              onKeyDown={(e) => e.key === 'Enter' && (onRename(group.id, editName), setEditingId(null))}
              className="flex-1 rounded-md px-3 py-2 text-sm border border-border bg-background"
              autoFocus
            />
          ) : (
            <button
              onClick={() => onSelect(group.id)}
              className={`flex-1 rounded-md px-3 py-2 text-sm text-left transition-colors ${
                activeGroupId === group.id ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground hover:bg-accent'
              }`}
            >
              {group.name}
            </button>
          )}
          <button onClick={() => { setEditingId(group.id); setEditName(group.name); }} className="rounded-md p-1 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity">
            <Pencil className="size-3" />
          </button>
          <button onClick={() => onDelete(group.id)} className="rounded-md p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
            <Trash2 className="size-3" />
          </button>
        </div>
      ))}
      <div className="flex gap-1 mt-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="新分区..."
          className="flex-1 rounded-md px-3 py-2 text-sm border border-border bg-background"
          onKeyDown={(e) => e.key === 'Enter' && newName.trim() && (onCreate(newName.trim()), setNewName(''))}
        />
        <button
          onClick={() => newName.trim() && (onCreate(newName.trim()), setNewName(''))}
          className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: 更新 TodoList.tsx 增加分区**

在 TodoList 组件中集成 TodoGroupManager，按分区筛选 Todo 项。

- [ ] **Step 7: 更新 API 路由支持 Todo 分区**

在 `app/api/categories/route.ts` 中确保支持 `type=TODO` 的 Category CRUD。
在 `app/api/todos/route.ts` 中添加按 categoryId 筛选支持。

- [ ] **Step 8: 更新 admin/todos/page.tsx**

集成 TodoGroupManager + TodoList，支持分区切换。

- [ ] **Step 9: 更新其他 Admin 组件适配新色系**

PasswordForm, SettingsForm, LogoutButton, CategoryManager, PostForm — 将暖色变量替换为 shadcn 语义色。

- [ ] **Step 10: 验证 Admin 后台**

Run: `npm run dev`
登录后台 → 文章管理/编辑器/Todo分区/设置 全部正常

- [ ] **Step 11: Commit**

```bash
git add app/admin/ components/admin/ app/api/todos/ app/api/categories/
git commit -m "feat: adapt admin to new design system + add todo group management"
```

---

### Task 12: 最终验证 + 清理

**Files:**
- 全项目检查

- [ ] **Step 1: 检查所有暖色变量残留**

搜索 `--paper`, `--ink`, `--ink-muted`, `--accent-hover`, `--line`, `#FAF7F2`, `#3D3530`, `#8A7F75`, `#C97B3D`, `#B86A2D`, `#E8E0D5` 等暖色值，确保全部替换。

- [ ] **Step 2: 检查所有 Noto 字体残留**

搜索 `Noto Sans SC`, `Noto Serif SC`, `--font-serif`, `--font-heading`，确保全部删除。

- [ ] **Step 3: 检查 motion 入场动画残留**

搜索 `motion` 的 `initial`, `animate`, `whileInView` 在 HeroSection 中的使用，确保已删除。保留 CatButton 的 motion。

- [ ] **Step 4: 构建验证**

Run: `npm run build`
Expected: 构建成功，无错误

- [ ] **Step 5: 本地全流程验证**

Run: `npm run dev`
- `/` → 重定向到 `/zh`
- `/zh` → 首页，黑白灰风格，Geist 字体
- `/zh/blog` → 博客列表，搜索/分类筛选
- `/zh/blog/[slug]` → 博客详情 + TOC
- `/zh/projects` → 项目列表
- `/zh/about` → 关于页
- `/en` → 英文版
- 猫按钮 → 密码登录 → Admin 后台
- Admin Todo 分区功能
- 暗色模式切换

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: final cleanup and verification for UI redesign"
```
