# 网站UI重构设计文档

## 概述

将当前暖色文艺纸质书感风格，重构为冷色极简开发者风格。保留猫按钮、Admin编辑器、motion动画等核心元素，新增国际化、博客搜索、Todo分区等功能。

**设计关键词：** minimal / clean / professional / developer-focused / content-first / high whitespace / black-white-gray

**参考：** Vercel 官网 / Linear App / shadcn/ui base-nova

---

## 1. 设计系统

### 1.1 颜色 — OKLCH 中性色

所有颜色通过 CSS 变量定义，使用 OKLCH 色彩空间（chroma=0 纯中性色），映射到 shadcn 语义色。

**亮色模式：**

| 语义 | 值 | OKLCH |
|------|------|-------|
| Background | `#FFFFFF` | oklch(1 0 0) |
| Primary Text | `#252525` | oklch(0.145 0 0) |
| Secondary Text | `#8A8A8A` | oklch(0.556 0 0) |
| Border | `#EAEAEA` | oklch(0.922 0 0) |
| Hover BG | `#F5F5F5` | oklch(0.97 0 0) |
| Primary Button BG | `#252525` | 同 Primary Text |
| Destructive | oklch(0.577 0.245 27.325) | 唯一带色相，仅危险操作 |

**暗色模式：**

| 语义 | 值 | OKLCH |
|------|------|-------|
| Background | `#252525` | oklch(0.145 0 0) |
| Primary Text | `#FAFAFA` | oklch(0.985 0 0) |
| Secondary Text | `#8A8A8A` | oklch(0.708 0 0) |
| Border | `rgba(255,255,255,0.1)` | oklch(1 0 0 / 10%) |
| Hover BG | `#454545` | oklch(0.269 0 0) |
| Primary Button BG | `#EAEAEA` | — |
| Destructive | oklch(0.704 0.191 22.216) | — |

**原则：**
- 删除所有暖色变量（`--paper`, `--ink`, `--ink-muted`, `--accent-hover`, `--line`）
- 不使用彩色背景，不使用渐变
- 极少使用阴影（仅灯箱 shadow-2xl）
- 边框统一 50% 透明度营造轻盈感，hover 时变 100%
- 状态徽章使用 10% 透明度彩色底 + 对应色文字

### 1.2 字体 — Geist Sans + Geist Mono

| 变量 | 值 | 用途 |
|------|------|------|
| `--font-sans` | Geist Sans, "PingFang SC", "Microsoft YaHei", sans-serif | 正文+标题 |
| `--font-mono` | Geist Mono, ui-monospace, SFMono-Regular, Menlo, monospace | 代码 |

- 通过 Google Fonts CDN 加载 Geist Sans 和 Geist Mono
- 删除 Noto Sans SC / Noto Serif SC
- 删除 `--font-serif` / `--font-heading`（标题用同族字体，不加衬线）
- 中文回退到系统字体（PingFang SC / Microsoft YaHei）

### 1.3 字号梯度

| 用途 | 字号 | Tailwind |
|------|------|----------|
| Hero 标题 | 48px → 60px | text-5xl sm:text-6xl |
| 页面主标题 | 30px → 36px | text-3xl sm:text-4xl |
| 区块标题 | 24px | text-2xl |
| 卡片标题 | 18-20px | text-lg / text-xl |
| 组件/按钮 | 14px | text-sm |
| 辅助/标签 | 12px | text-xs |
| Markdown 正文 | 16px | 1rem |

字重：标题 700/600，按钮/导航 500，正文 400
字间距：标题 tracking-tight，标签 uppercase tracking-wider

### 1.4 间距与布局

| 元素 | 宽度 |
|------|------|
| 主内容区 | max-w-5xl (1024px) |
| 文章内容 | max-w-3xl (768px) |
| 登录表单 | max-w-sm (384px) |
| TOC 侧栏 | w-56 (224px) |
| Admin 侧栏 | w-60 (240px) |

页面垂直间距：Hero py-24 sm:py-36，列表页 py-16，详情页 py-12，Admin py-8
水平内边距：px-4 sm:px-6

### 1.5 圆角与边框

圆角（基于 `--radius: 0.625rem`）：
- 按钮/卡片/输入框/代码块：rounded-lg (10px)
- 导航链接：rounded-md (8px)
- 标签/徽章：rounded-full (9999px)

边框规范：
- 默认：1px border-border/50
- 悬停：1px border-border
- 表单输入：1px border-border（聚焦 border-ring）
- 空状态：1px border-dashed border-border

---

## 2. 国际化

### 2.1 架构

- 库：next-intl
- URL 结构：`/[locale]/path`（如 `/zh/blog`, `/en/blog`）
- 默认语言：中文（`zh`），`/` 重定向到 `/zh`
- 语言切换按钮在导航栏 Actions 区域
- 切换时 `router.replace` 保持当前页面

### 2.2 翻译文件

```
messages/
├── zh.json    # 中文翻译
└── en.json    # 英文翻译
```

### 2.3 路由结构

```
app/
├── [locale]/
│   ├── layout.tsx          # 前台布局
│   ├── page.tsx            # 首页
│   ├── blog/
│   │   ├── page.tsx        # 博客列表
│   │   └── [slug]/page.tsx # 博客详情
│   ├── projects/
│   │   ├── page.tsx        # 项目列表
│   │   └── [slug]/page.tsx # 项目详情
│   └── about/page.tsx      # 关于
├── admin/                  # 后台（不参与国际化，保持中文）
│   ├── layout.tsx
│   └── ...
└── api/                    # API 路由（不参与国际化）
    └── ...
```

### 2.4 不国际化的部分

- Admin 后台（保持中文）
- API 路由
- 数据库内容（博客文章等由作者决定语言）

---

## 3. 导航栏

```
QZ Site        首页 博客 项目 关于        GitHub EN Theme
```

- 高度 56px (h-14)
- sticky top-0 z-50，背景 80% 不透明 + backdrop-blur-md
- 底部 1px border-border/50，无阴影
- Logo：text-sm font-semibold tracking-tight，hover: opacity 80%
- 导航链接：rounded-md px-3 py-1.5 text-sm font-medium
  - 激活：text-foreground
  - 非激活：text-muted-foreground
  - hover：bg-accent + text-accent-foreground，150ms
- 图标按钮（Theme/EN/GitHub）：rounded-md p-1.5
- 移动端：sm 以下汉堡菜单，面板 bg-background/95 backdrop-blur-md

---

## 4. 首页

### 4.1 Hero Section

- 垂直间距 py-24 sm:py-36
- 标题：text-5xl sm:text-6xl font-bold tracking-tight（"欢迎"）
- 描述：text-lg text-muted-foreground
- 按钮：Primary（阅读博客）+ Secondary（查看项目），gap-3
- **无入场动画**，静态呈现

### 4.2 最新文章区域

- 标题 + 右侧"查看全部 →"
- 文章卡片：border-border/50 rounded-lg p-5
- 卡片结构：分类 → 标题 → 摘要 → 日期·阅读时间
- 网格：1列 → sm:2列 → lg:3列，gap-6
- Hover：border变实 + bg-muted/50 + 标题变 text-primary

### 4.3 最新项目区域

- 同文章区域风格
- 卡片：项目名 → 描述 → Tags → Demo链接
- 网格：1列 → sm:2列

---

## 5. 博客

### 5.1 博客列表页

- 页面标题 + 描述
- 筛选区（border-b border-border/50 pb-4）：
  - 分类 Tabs：Active rounded-full bg-foreground text-background / Inactive bg-secondary
  - 搜索框：h-10 rounded-lg border-border/50，左侧搜索图标，右侧清除按钮
- 文章列表：Card 风格，gap-8
- 对外展示为时间顺序
- 搜索功能：输入文字查询匹配对应博客

### 5.2 博客详情页

- 两栏布局：内容(max-w-3xl) + TOC(w-56)
- 标题：text-3xl sm:text-4xl font-bold tracking-tight
- 元数据：分类 + 日期 + 阅读时间
- 正文：prose prose-neutral dark:prose-invert
- 底部：mt-16 border-t border-border/50 pt-6
- TOC：sticky top-20，IntersectionObserver，仅 lg 以上显示

---

## 6. 项目页

### 6.1 项目列表

- 标题 + 描述
- 两列网格，gap-6
- 卡片：rounded-lg border-border/50 p-6
- 结构：项目名 → 描述 → Tags(rounded-full bg-muted) → 链接图标
- Hover：border变实 + bg-muted/30 + 标题变色

### 6.2 项目详情页

- 标题 + 描述 + Tags + Demo按钮 + 源码链接
- Demo按钮：rounded-full bg-foreground text-background
- 正文 Markdown 渲染同博客

---

## 7. 关于页

- 标题 + 描述
- "我做什么" 区块 + 技能 Tags（rounded-full bg-muted）
- 联系方式链接列表

---

## 8. Admin 后台

### 8.1 登录方式

- 猫按钮（CatButton）点击 → 弹出密码输入框
- **只需密码，不需要用户名**
- 验证通过进入后台
- Todo List 仅本人可见操作

### 8.2 布局

- Sidebar(w-60) + Content
- Sidebar：border-r border-border/50，导航项 rounded-md px-3 py-2
- 移动端：md 以下隐藏侧栏

### 8.3 文章管理

- 表格：rounded-lg border-border/50
- 表头：bg-muted/50，行悬停 bg-muted/30
- Status Badge：Published(绿) / Draft(琥珀)
- 删除：二次确认，3秒超时自动恢复

### 8.4 编辑器

- 保留 Tiptap 富文本编辑器
- 左右分栏：编辑区 + 预览区（md 以上显示预览）
- 自动保存：5秒防抖
- 保存状态指示器：Saved(绿点) / Saving(旋转) / Unsaved(琥珀) / Error(红)

### 8.5 Todo List 分区

- 支持自定义分区：可创建/删除/重命名分区
- 每个分区独立管理 Todo 项
- 分区示例：工作 / 学习 / 生活（用户自定义）
- 仅登录后可见和操作

---

## 9. Markdown 内容样式

### 9.1 基础

- prose prose-neutral dark:prose-invert max-w-none
- headings: scroll-mt-16
- links: text-primary no-underline, hover:underline
- images: rounded-lg, cursor-zoom-in

### 9.2 代码块（CodeBlock）

- 背景：zinc-950(亮色) / zinc-900(暗色)
- 圆角 rounded-lg，border border-border
- 标题栏：语言标签 + 复制按钮
- 行号：absolute left-0，text-xs text-zinc-600
- 语法高亮：highlight.js + GitHub Dark

### 9.3 Callout 提示框

4种类型，各有彩色边框(30%) + 彩色背景(5%) + 彩色文字：
- tip: emerald / info: blue / warning: amber / danger: red

### 9.4 其他

- 内联代码：bg-muted rounded px-1.5 py-0.5
- 引用块：border-left 4px solid var(--border)
- 表格：border-collapse，表头/偶数行 bg-muted
- 图片灯箱：bg-black/80 backdrop-blur-sm，ESC/点击关闭，滚动锁定

---

## 10. 交互规范

- 过渡：统一 transition-colors 150ms ease
- 按钮按下：translate-y-px（物理按压感）
- 卡片 hover 三层反馈：边框50%→100% + 浅背景 + 标题变色
- 主题切换：disableTransitionOnChange
- 删除：二次确认，3秒超时自动恢复
- 编辑器自动保存：5秒防抖 + 状态指示器
- 保留猫按钮 motion 动画（whileHover 弹跳）

---

## 11. 保留元素

| 元素 | 处理方式 |
|------|---------|
| 猫按钮 (CatButton) | 保留，改为密码登录（不需要用户名） |
| Admin Tiptap 编辑器 | 保留，适配新色系 |
| motion 动画 | 保留猫按钮弹跳，删除 Hero 入场动画 |
| shadcn/ui base-nova | 保留，重新生成组件适配新色系 |
| @base-ui/react | 保留 |

---

## 12. 数据库变更

### Todo 分区：复用现有 Category 模型

现有 Category 模型已支持 `BLOG` 和 `TODO` 两种类型，Todo 通过 `categoryId` 关联分类。
无需新建 TodoGroup 模型，只需：

- 确保 Category 中 `type=TODO` 的记录可作为 Todo 分区使用
- 新增 Todo 分区管理 API：创建/删除/重命名 `type=TODO` 的 Category
- Admin 后台 Todo 管理页面增加分区切换 UI

### 认证改造：仅密码登录

当前认证必须用户名+密码，需改造为仅密码登录：

- 修改 `lib/auth/service.ts` 的 `login()` 函数：去掉 username 参数，只验证密码
- 修改 `/api/auth/login` 路由：只接收 password 字段
- 修改猫按钮登录对话框：只显示密码输入框
- 保留 IP 级别防暴力破解保护
- 保留 iron-session 会话机制

### 现有模型兼容

- 使用 `prisma db push` 同步，只加字段不删数据
- 所有现有数据保持不变

---

## 13. 实施路径

方案 A：设计系统先行，逐层替换

1. 重写 globals.css — OKLCH 色彩变量 + Geist 字体
2. 更新 shadcn/ui 组件 — 重新生成适配新色系
3. 引入 next-intl — 国际化框架 + [locale] 路由
4. 逐页面重构 — Header → 首页 → 博客 → 项目 → 关于 → Admin
5. 新增功能 — Todo 分区 + 博客搜索 + 密码登录改造
6. 认证改造 — 仅密码登录
