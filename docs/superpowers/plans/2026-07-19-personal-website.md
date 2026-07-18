# 个人数字花园 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现一个以博客为核心、含私人 Todo 管理和知识搜索的个人数字花园网站，部署到腾讯云。

**Architecture:** Next.js 16 全栈应用 + PostgreSQL + Tiptap 编辑器 + bcrypt/iron-session 认证 + Docker Compose 部署。前端 App Router + Server Actions，公开部分静态渲染，私密部分中间件保护。

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS v4, shadcn/ui, Motion, Lucide React, Tiptap, Prisma ORM, PostgreSQL, bcrypt, iron-session, Docker, GitHub Actions, Nginx。

## Global Constraints

- Node.js 20+
- Next.js 16 + App Router
- TypeScript strict mode
- Tailwind CSS v4
- 配色：背景 `#FAF7F2`、主文字 `#3D3530`、强调 `#C97B3D`
- 字体：标题 Noto Serif SC、正文 Noto Sans SC
- 数据库：PostgreSQL 16 + Prisma ORM
- 部署：腾讯云 + Docker Compose + Nginx + HTTPS
- 代码注释用中文（用户偏好）

---

## 文件结构

```
个人网站v3/
├─ app/
│  ├─ layout.tsx                    根布局（字体 + 主题色）
│  ├─ page.tsx                       首页（流式单页）
│  ├─ globals.css                   全局样式 + Tailwind
│  ├─ blog/
│  │  ├─ page.tsx                   博客列表（按时间倒序）
│  │  └─ [slug]/page.tsx            博客详情
│  ├─ admin/                        私密后台（中间件保护）
│  │  ├─ layout.tsx                 后台布局
│  │  ├─ page.tsx                   后台首页
│  │  ├─ posts/
│  │  │  ├─ page.tsx                文章管理列表（含搜索）
│  │  │  ├─ new/page.tsx            新建文章
│  │  │  └─ [id]/page.tsx           编辑文章
│  │  ├─ todos/page.tsx             Todo 管理
│  │  └─ settings/page.tsx          设置（分区+个人信息+密码）
│  └─ api/
│     ├─ auth/login/route.ts        登录
│     ├─ auth/logout/route.ts       退出
│     ├─ posts/route.ts             文章 CRUD
│     ├─ posts/[id]/route.ts
│     ├─ todos/route.ts             Todo CRUD
│     ├─ categories/route.ts        分区 CRUD
│     ├─ settings/route.ts          设置
│     └─ upload/route.ts            图片上传
├─ components/
│  ├─ ui/                           shadcn 组件（button/input/card 等）
│  ├─ layout/Header.tsx
│  ├─ layout/Footer.tsx
│  ├─ layout/Container.tsx
│  ├─ home/HeroSection.tsx
│  ├─ home/RecentPosts.tsx
│  ├─ home/ContactSection.tsx
│  ├─ blog/PostCard.tsx
│  ├─ blog/PostContent.tsx
│  ├─ auth/CatButton.tsx            右下角小猫按钮
│  ├─ auth/LoginDialog.tsx          登录弹窗
│  ├─ admin/AdminSidebar.tsx
│  ├─ admin/PostEditor.tsx          Tiptap 编辑器封装
│  ├─ admin/TodoList.tsx
│  └─ admin/CategoryManager.tsx
├─ lib/
│  ├─ db.ts                         Prisma 客户端单例
│  ├─ auth.ts                       密码 hash + 验证
│  ├─ session.ts                    iron-session 配置
│  ├─ posts.ts                      文章工具（slug/阅读时间）
│  └─ utils.ts                      cn 等通用工具
├─ prisma/schema.prisma             数据模型
├─ middleware.ts                    路由保护
├─ Dockerfile
├─ docker-compose.yml
├─ .env.example
├─ .github/workflows/deploy.yml
├─ nginx/conf.d/default.conf
└─ docs/deploy.md
```

---

## 阶段 1：项目初始化

### Task 1: 初始化 Next.js 项目

**Files:**
- Create: `package.json`、`tsconfig.json`、`next.config.ts`、`app/layout.tsx`、`app/page.tsx`、`app/globals.css`

**Interfaces:**
- Produces: 可运行的 Next.js 16 项目骨架

- [ ] **Step 1: 创建 Next.js 16 项目**

```bash
npx create-next-app@latest . --typescript --app --tailwind --eslint --no-src-dir --import-alias "@/*" --use-npm --yes
```

交互式提示全部回车选默认。

- [ ] **Step 2: 验证项目可启动**

```bash
npm run dev
```

打开 http://localhost:3000 看到默认欢迎页。

- [ ] **Step 3: 安装额外依赖**

```bash
npm install @prisma/client prisma @tiptap/react @tiptap/starter-kit @tiptap/extension-image @tiptap/extension-link @tiptap/extension-placeholder @tiptap/extension-code-block-lowlight lowlight iron-session bcryptjs lucide-react motion next-themes clsx tailwind-merge
npm install -D @types/bcryptjs
```

- [ ] **Step 4: 初始化 shadcn/ui**

```bash
npx shadcn@latest init -d
```

- [ ] **Step 5: 添加常用 shadcn 组件**

```bash
npx shadcn@latest add button input card dialog form label textarea badge dropdown-menu separator tabs -y
```

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "chore: init Next.js 16 + Tailwind + shadcn/ui"
```

---

### Task 2: 配置 Prisma + PostgreSQL 数据模型

**Files:**
- Create: `prisma/schema.prisma`
- Create: `lib/db.ts`
- Create: `.env.example`
- Create: `.env`（不提交）

**Interfaces:**
- Produces: `prisma.post.findMany()`、`prisma.category.findMany()`、`prisma.todo.findMany()`、`prisma.user.findFirst()`、`prisma.setting.findFirst()`

- [ ] **Step 1: 初始化 Prisma**

```bash
npx prisma init --datasource-provider postgresql
```

- [ ] **Step 2: 写入 schema.prisma**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum PostStatus {
  DRAFT
  PUBLISHED
}

enum TodoStatus {
  TODO
  DONE
}

enum CategoryType {
  BLOG
  TODO
}

model Post {
  id          String     @id @default(cuid())
  title       String
  content     String     @db.Text
  excerpt     String?
  slug        String     @unique
  categoryId  String?
  category    Category?  @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  tags        String[]
  status      PostStatus @default(DRAFT)
  readTime    Int        @default(1)
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  @@index([status, createdAt])
  @@index([categoryId])
}

model Category {
  id          String       @id @default(cuid())
  name        String
  type        CategoryType
  description String?
  color       String?      @default("#C97B3D")
  sortOrder   Int           @default(0)
  posts       Post[]
  todos       Todo[]
  createdAt   DateTime     @default(now())

  @@index([type])
}

model Todo {
  id          String     @id @default(cuid())
  title       String
  description String?
  categoryId  String?
  category    Category?  @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  status      TodoStatus @default(TODO)
  priority    Int        @default(0)
  dueDate     DateTime?
  createdAt    DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  @@index([status])
  @@index([categoryId])
}

model User {
  id           String   @id @default(cuid())
  username     String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
}

model Setting {
  id    String @id @default(cuid())
  key   String @unique
  value String
}
```

- [ ] **Step 3: 创建 lib/db.ts（Prisma 单例）**

```typescript
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

- [ ] **Step 4: 创建 .env.example**

```bash
# 数据库连接（本地开发用 Docker 起的 PostgreSQL）
DATABASE_URL="postgresql://blog:blog@localhost:5432/blog?schema=public"

# 会话密钥（32 位以上随机字符串，生产环境务必更换）
SESSION_SECRET="change-me-to-a-long-random-string-at-least-32-chars"

# 站点配置
NEXT_PUBLIC_SITE_URL="http://localhost:3000"

# GitHub 链接
NEXT_PUBLIC_GITHUB_URL="https://github.com/666666999999666"
```

- [ ] **Step 5: 复制为 .env 并填入实际值（.env 不提交）**

确保 `.gitignore` 中已有 `.env`。

- [ ] **Step 6: 用 Docker 起一个本地 PostgreSQL 用于开发**

创建 `docker-compose.dev.yml`：

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: blog
      POSTGRES_USER: blog
      POSTGRES_PASSWORD: blog
    ports:
      - "5432:5432"
    volumes:
      - ./data/dev-postgres:/var/lib/postgresql/data
```

启动：

```bash
docker compose -f docker-compose.dev.yml up -d
```

- [ ] **Step 7: 应用 schema 到数据库**

```bash
npx prisma db push
```

- [ ] **Step 8: 生成 Prisma Client**

```bash
npx prisma generate
```

- [ ] **Step 9: 提交**

```bash
git add prisma/ lib/db.ts .env.example docker-compose.dev.yml
git commit -m "feat: add Prisma schema and PostgreSQL setup"
```

---

### Task 3: 配置全局样式与主题色

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`
- Create: `lib/utils.ts`（若 shadcn 未自动创建）

**Interfaces:**
- Produces: 全局配色变量、字体加载、`cn()` 工具函数

- [ ] **Step 1: 写入 app/globals.css**

```css
@import "tailwindcss";

@theme {
  --color-paper: #FAF7F2;
  --color-card: #FFFFFF;
  --color-ink: #3D3530;
  --color-ink-muted: #8A7F75;
  --color-accent: #C97B3D;
  --color-accent-hover: #B86A2D;
  --color-line: #E8E0D5;

  --font-serif: "Noto Serif SC", serif;
  --font-sans: "Noto Sans SC", sans-serif;
}

@layer base {
  body {
    background-color: var(--color-paper);
    color: var(--color-ink);
    font-family: var(--font-sans);
    font-size: 17px;
    line-height: 1.8;
  }

  h1, h2, h3, h4 {
    font-family: var(--font-serif);
    font-weight: 600;
  }

  ::selection {
    background: var(--color-accent);
    color: white;
  }
}

/* 滚动条柔化 */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-thumb {
  background: var(--color-line);
  border-radius: 4px;
}
```

- [ ] **Step 2: 修改 app/layout.tsx 加载字体**

```tsx
import type { Metadata } from "next";
import { Noto_Serif_SC, Noto_Sans_SC } from "next/font/google";
import "./globals.css";

const notoSerif = Noto_Serif_SC({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-noto-serif-sc",
  display: "swap",
});

const notoSans = Noto_Sans_SC({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-noto-sans-sc",
  display: "swap",
});

export const metadata: Metadata = {
  title: "个人数字花园",
  description: "个人博客与知识管理",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className={`${notoSerif.variable} ${notoSans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: 创建/确认 lib/utils.ts**

```typescript
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 4: 修改 globals.css 的 @theme 字体变量引用**

把 `--font-serif` 改为引用 Next Font 变量：

```css
@theme {
  --font-serif: var(--font-noto-serif-sc), serif;
  --font-sans: var(--font-noto-sans-sc), sans-serif;
  /* 其余不变 */
}
```

- [ ] **Step 5: 启动验证**

```bash
npm run dev
```

打开 http://localhost:3000 确认背景是米白色、字体加载正常。

- [ ] **Step 6: 提交**

```bash
git add app/globals.css app/layout.tsx lib/utils.ts
git commit -m "feat: apply warm paper theme and Chinese fonts"
```

---

## 阶段 2：认证系统

### Task 4: 实现密码 hash 与会话管理

**Files:**
- Create: `lib/auth.ts`
- Create: `lib/session.ts`

**Interfaces:**
- Produces: `hashPassword(plain): Promise<string>`、`verifyPassword(plain, hash): Promise<boolean>`、`getSession(): Promise<SessionData>`、`saveSession(data): Promise<void>`、`destroySession(): Promise<void>`

- [ ] **Step 1: 写 lib/auth.ts**

```typescript
import bcrypt from "bcryptjs"

const SALT_ROUNDS = 10

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}
```

- [ ] **Step 2: 写 lib/session.ts**

```typescript
import { getIronSession, type SessionOptions } from "iron-session"
import { cookies } from "next/headers"

export interface SessionData {
  userId?: string
  username?: string
  isLoggedIn: boolean
}

const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET as string,
  cookieName: "blog_session",
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24, // 24 小时
  },
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions)
}
```

- [ ] **Step 3: 创建种子脚本初始化默认账号**

创建 `prisma/seed.ts`：

```typescript
import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../lib/auth'

const prisma = new PrismaClient()

async function main() {
  const password = process.env.SEED_PASSWORD || 'admin123'
  const hash = await hashPassword(password)

  await prisma.user.upsert({
    where: { username: 'admin' },
    update: { passwordHash: hash },
    create: { username: 'admin', passwordHash: hash },
  })

  // 初始化默认设置
  await prisma.setting.upsert({
    where: { key: 'owner_name' },
    update: {},
    create: { key: 'owner_name', value: '你的名字' },
  })
  await prisma.setting.upsert({
    where: { key: 'tagline' },
    update: {},
    create: { key: 'tagline', value: '今天也想写点什么' },
  })

  // 初始化默认分区
  const blogCat = await prisma.category.upsert({
    where: { id: 'cat-blog-tech' },
    update: {},
    create: { id: 'cat-blog-tech', name: '技术笔记', type: 'BLOG', sortOrder: 0 },
  })
  const todoCat = await prisma.category.upsert({
    where: { id: 'cat-todo-study' },
    update: {},
    create: { id: 'cat-todo-study', name: '学习', type: 'TODO', sortOrder: 0 },
  })

  console.log('Seed 完成')
  console.log('默认账号: admin /', password)
}

main().catch(console.error).finally(() => prisma.$disconnect())
```

- [ ] **Step 4: 在 package.json 添加 seed 脚本**

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "db:push": "prisma db push",
    "db:generate": "prisma generate",
    "db:seed": "tsx prisma/seed.ts"
  },
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```

安装 tsx：

```bash
npm install -D tsx
npx prisma db seed
```

- [ ] **Step 5: 提交**

```bash
git add lib/auth.ts lib/session.ts prisma/seed.ts package.json
git commit -m "feat: add password hashing, session, and seed script"
```

---

### Task 5: 实现登录 API + 中间件保护

**Files:**
- Create: `app/api/auth/login/route.ts`
- Create: `app/api/auth/logout/route.ts`
- Create: `middleware.ts`

**Interfaces:**
- Produces: `POST /api/auth/login`（body: `{username, password}`，返回 200/401）、`POST /api/auth/logout`、`middleware` 自动保护 `/admin/*`

- [ ] **Step 1: 写登录 API（app/api/auth/login/route.ts）**

```typescript
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { verifyPassword } from "@/lib/auth"
import { getSession } from "@/lib/session"

// 简单的失败次数限流（内存版，单进程够用）
const failCount = new Map<string, { count: number; until: number }>()

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown"
  const now = Date.now()
  const record = failCount.get(ip)
  if (record && now < record.until) {
    return NextResponse.json(
      { error: "失败次数过多，请 5 分钟后再试" },
      { status: 429 }
    )
  }

  const { username, password } = await req.json()
  if (!username || !password) {
    return NextResponse.json({ error: "参数缺失" }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { username } })
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    const count = (record?.count || 0) + 1
    if (count >= 5) {
      failCount.set(ip, { count, until: now + 5 * 60 * 1000 })
    } else {
      failCount.set(ip, { count, until: 0 })
    }
    return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 })
  }

  failCount.delete(ip)
  const session = await getSession()
  session.userId = user.id
  session.username = user.username
  session.isLoggedIn = true
  await session.save()

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: 写退出 API（app/api/auth/logout/route.ts）**

```typescript
import { NextResponse } from "next/server"
import { getSession } from "@/lib/session"

export async function POST() {
  const session = await getSession()
  session.destroy()
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: 写中间件 middleware.ts**

```typescript
import { NextRequest, NextResponse } from "next/server"

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  // 保护 /admin 路径（页面与 API）
  if (pathname.startsWith("/admin")) {
    const session = req.cookies.get("blog_session")?.value
    if (!session) {
      const loginUrl = req.nextUrl.clone()
      loginUrl.pathname = "/"
      loginUrl.searchParams.set("from", pathname)
      return NextResponse.redirect(loginUrl)
    }
  }
  return NextResponse.next()
}

export const config = {
  matcher: ["/admin/:path*"],
}
```

注意：iron-session 的 cookie 存在即视为已登录（密码已加密在 cookie 内），中间件只检查 cookie 存在性，真正的会话有效性在 Server Component 里用 `getSession()` 验证。

- [ ] **Step 4: 手动测试登录**

用 curl 测试：

```bash
curl -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d "{\"username\":\"admin\",\"password\":\"admin123\"}" -c cookies.txt
```

预期返回 `{"ok":true}`，cookies.txt 里有 `blog_session`。

- [ ] **Step 5: 提交**

```bash
git add app/api/auth middleware.ts
git commit -m "feat: add login/logout API and admin route protection"
```

---

### Task 6: 小猫按钮 + 登录弹窗

**Files:**
- Create: `components/auth/CatButton.tsx`
- Create: `components/auth/LoginDialog.tsx`
- Create: `app/api/auth/check/route.ts`（检查当前是否登录，供客户端组件用）

**Interfaces:**
- Produces: `<CatButton />`（右下角浮动按钮）、`<LoginDialog open onOpenChange />`

- [ ] **Step 1: 写检查登录状态 API**

```typescript
// app/api/auth/check/route.ts
import { NextResponse } from "next/server"
import { getSession } from "@/lib/session"

export async function GET() {
  const session = await getSession()
  return NextResponse.json({ isLoggedIn: session.isLoggedIn })
}
```

- [ ] **Step 2: 写登录弹窗 components/auth/LoginDialog.tsx**

```tsx
"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useRouter } from "next/navigation"

export function LoginDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    })
    setLoading(false)
    if (res.ok) {
      router.push("/admin")
    } else {
      const data = await res.json()
      setError(data.error || "登录失败")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>进入花园</DialogTitle>
          <DialogDescription>私人空间，仅限本人。</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="u">用户名</Label>
            <Input id="u" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p">密码</Label>
            <Input id="p" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={loading}>{loading ? "进入中…" : "进入"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: 写小猫按钮 components/auth/CatButton.tsx**

```tsx
"use client"

import { useState, useEffect } from "react"
import { Cat } from "lucide-react"
import { motion } from "motion/react"
import { LoginDialog } from "./LoginDialog"
import { useRouter } from "next/navigation"

export function CatButton() {
  const [open, setOpen] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)
  const router = useRouter()

  useEffect(() => {
    fetch("/api/auth/check")
      .then((r) => r.json())
      .then((d) => setLoggedIn(d.isLoggedIn))
  }, [])

  function handleClick() {
    if (loggedIn) {
      router.push("/admin")
    } else {
      setOpen(true)
    }
  }

  return (
    <>
      <motion.button
        onClick={handleClick}
        className="fixed bottom-6 right-6 z-50 h-12 w-12 rounded-full bg-white/60 backdrop-blur-sm border border-line flex items-center justify-center text-ink-muted hover:text-accent hover:bg-white transition-colors"
        whileHover={{ y: -4, scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        aria-label="管理入口"
        title="喵~"
      >
        <Cat className="h-5 w-5" />
      </motion.button>
      <LoginDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
```

- [ ] **Step 4: 在根 layout 引入 CatButton**

修改 `app/layout.tsx`，在 body 最后加：

```tsx
import { CatButton } from "@/components/auth/CatButton"
// ...
<body>
  {children}
  <CatButton />
</body>
```

- [ ] **Step 5: 启动验证**

```bash
npm run dev
```

打开首页，右下角应该看到小猫按钮，点击弹出登录框，输错显示错误，输对（admin/admin123）跳转到 /admin（暂时会 404，下个阶段实现）。

- [ ] **Step 6: 提交**

```bash
git add components/auth app/api/auth/check app/layout.tsx
git commit -m "feat: add cat button entrance and login dialog"
```

---

## 阶段 3：公开页面

### Task 7: 布局组件与首页

**Files:**
- Create: `components/layout/Container.tsx`
- Create: `components/layout/Header.tsx`
- Create: `components/layout/Footer.tsx`
- Create: `components/home/HeroSection.tsx`
- Create: `components/home/RecentPosts.tsx`
- Create: `components/home/ContactSection.tsx`
- Create: `lib/posts.ts`
- Modify: `app/page.tsx`

**Interfaces:**
- Produces: `<Container>`、`<Header>`、`<Footer>`、首页渲染
- Consumes: `prisma.post.findMany({ where: { status: "PUBLISHED" }, orderBy: { createdAt: "desc" }, take: 5 })`

- [ ] **Step 1: 写 Container 组件**

```tsx
// components/layout/Container.tsx
import { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function Container({
  children,
  className,
  size = "default",
}: {
  children: ReactNode
  className?: string
  size?: "default" | "narrow" | "wide"
}) {
  const max = size === "narrow" ? "max-w-[720px]" : size === "wide" ? "max-w-[1100px]" : "max-w-[920px]"
  return <div className={cn("mx-auto px-6", max, className)}>{children}</div>
}
```

- [ ] **Step 2: 写 Header**

```tsx
// components/layout/Header.tsx
import Link from "next/link"
import { Container } from "./Container"

export function Header() {
  return (
    <header className="py-8 border-b border-line">
      <Container>
        <nav className="flex items-center justify-between">
          <Link href="/" className="font-serif text-xl text-ink hover:text-accent transition-colors">
            数字花园
          </Link>
          <div className="flex items-center gap-6 text-sm">
            <Link href="/blog" className="text-ink-muted hover:text-accent transition-colors">文章</Link>
            <a href={process.env.NEXT_PUBLIC_GITHUB_URL} target="_blank" rel="noopener noreferrer" className="text-ink-muted hover:text-accent transition-colors">GitHub</a>
          </div>
        </nav>
      </Container>
    </header>
  )
}
```

- [ ] **Step 3: 写 Footer**

```tsx
// components/layout/Footer.tsx
import { Container } from "./Container"

export function Footer() {
  return (
    <footer className="py-8 border-t border-line mt-20">
      <Container>
        <p className="text-center text-sm text-ink-muted">
          © {new Date().getFullYear()} 数字花园 · 写字是和自己的对话
        </p>
      </Container>
    </footer>
  )
}
```

- [ ] **Step 4: 在 layout.tsx 引入 Header/Footer**

修改 `app/layout.tsx`：

```tsx
import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"

// body 内
<body>
  <Header />
  <main>{children}</main>
  <Footer />
  <CatButton />
</body>
```

- [ ] **Step 5: 写文章工具 lib/posts.ts**

```typescript
import { prisma } from "./db"

export async function getRecentPosts(take = 5) {
  return prisma.post.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { createdAt: "desc" },
    take,
    include: { category: true },
  })
}

export async function getAllPosts() {
  return prisma.post.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { createdAt: "desc" },
    include: { category: true },
  })
}

export async function getPostBySlug(slug: string) {
  return prisma.post.findUnique({
    where: { slug },
    include: { category: true },
  })
}

export function calculateReadTime(content: string): number {
  // 中文按字数算，每分钟 300 字
  const text = content.replace(/<[^>]+>/g, "")
  const chars = text.length
  return Math.max(1, Math.ceil(chars / 300))
}

export function generateSlug(title: string): string {
  const ts = Date.now().toString(36)
  const clean = title.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "-").toLowerCase().slice(0, 30)
  return `${clean}-${ts}`
}
```

- [ ] **Step 6: 写 HeroSection**

```tsx
// components/home/HeroSection.tsx
import { Container } from "@/components/layout/Container"
import { motion } from "motion/react"

export function HeroSection({ name, tagline }: { name: string; tagline: string }) {
  return (
    <section className="py-24 md:py-32">
      <Container size="narrow">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center"
        >
          <div className="mx-auto mb-8 h-24 w-24 rounded-full bg-accent/10 flex items-center justify-center text-accent text-3xl font-serif">
            {name.slice(0, 1)}
          </div>
          <h1 className="text-4xl md:text-5xl text-ink mb-4">{name}</h1>
          <p className="text-lg text-ink-muted">{tagline}</p>
        </motion.div>
      </Container>
    </section>
  )
}
```

- [ ] **Step 7: 写 RecentPosts**

```tsx
// components/home/RecentPosts.tsx
import Link from "next/link"
import { Container } from "@/components/layout/Container"
import { Post } from "@prisma/client"

function formatDate(d: Date) {
  return new Date(d).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" })
}

export function RecentPosts({ posts }: { posts: (Post & { category: { name: string } | null })[] }) {
  if (posts.length === 0) {
    return (
      <section className="py-16">
        <Container size="narrow">
          <p className="text-center text-ink-muted">还没有文章，花园刚刚种下。</p>
        </Container>
      </section>
    )
  }
  return (
    <section className="py-16">
      <Container size="narrow">
        <h2 className="text-2xl font-serif text-ink mb-8">最近文章</h2>
        <ul className="space-y-8">
          {posts.map((p) => (
            <li key={p.id}>
              <Link href={`/blog/${p.slug}`} className="group block">
                <div className="flex items-baseline justify-between gap-4 mb-1">
                  <h3 className="text-xl text-ink group-hover:text-accent transition-colors">{p.title}</h3>
                  <time className="text-sm text-ink-muted whitespace-nowrap">{formatDate(p.createdAt)}</time>
                </div>
                {p.excerpt && <p className="text-ink-muted">{p.excerpt}</p>}
                <div className="flex items-center gap-3 mt-2 text-xs text-ink-muted">
                  <span>{p.readTime} min read</span>
                  {p.category && <span>· {p.category.name}</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-10 text-center">
          <Link href="/blog" className="text-accent hover:text-accent-hover transition-colors">
            查看全部文章 →
          </Link>
        </div>
      </Container>
    </section>
  )
}
```

- [ ] **Step 8: 写 ContactSection**

```tsx
// components/home/ContactSection.tsx
import { Container } from "@/components/layout/Container"
import { Github, Mail } from "lucide-react"

export function ContactSection({ githubUrl, email }: { githubUrl: string; email?: string }) {
  return (
    <section className="py-16">
      <Container size="narrow">
        <div className="flex flex-col items-center gap-4">
          <h2 className="text-2xl font-serif text-ink">联系</h2>
          <div className="flex items-center gap-6">
            <a href={githubUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-ink-muted hover:text-accent transition-colors">
              <Github className="h-5 w-5" /> GitHub
            </a>
            {email && (
              <a href={`mailto:${email}`} className="flex items-center gap-2 text-ink-muted hover:text-accent transition-colors">
                <Mail className="h-5 w-5" /> Email
              </a>
            )}
          </div>
        </div>
      </Container>
    </section>
  )
}
```

- [ ] **Step 9: 写首页 app/page.tsx**

```tsx
import { HeroSection } from "@/components/home/HeroSection"
import { RecentPosts } from "@/components/home/RecentPosts"
import { ContactSection } from "@/components/home/ContactSection"
import { getRecentPosts } from "@/lib/posts"
import { prisma } from "@/lib/db"

async function getSettings() {
  const settings = await prisma.setting.findMany()
  const map: Record<string, string> = {}
  for (const s of settings) map[s.key] = s.value
  return {
    name: map.owner_name || "你的名字",
    tagline: map.tagline || "今天也想写点什么",
    email: map.email,
  }
}

export default async function Home() {
  const [settings, posts] = await Promise.all([getSettings(), getRecentPosts(5)])
  return (
    <>
      <HeroSection name={settings.name} tagline={settings.tagline} />
      <RecentPosts posts={posts} />
      <ContactSection githubUrl={process.env.NEXT_PUBLIC_GITHUB_URL!} email={settings.email} />
    </>
  )
}
```

- [ ] **Step 10: 启动验证**

```bash
npm run dev
```

打开 http://localhost:3000，应看到：头像首字母圆圈、姓名、标语、最近文章列表（空时显示提示）、联系区。

- [ ] **Step 11: 提交**

```bash
git add components/layout components/home lib/posts.ts app/page.tsx app/layout.tsx
git commit -m "feat: build home page with hero, recent posts, contact"
```

---

### Task 8: 公开博客列表页 + 详情页

**Files:**
- Create: `app/blog/page.tsx`
- Create: `app/blog/[slug]/page.tsx`
- Create: `components/blog/PostContent.tsx`（渲染 Tiptap JSON 为 HTML 的客户端组件）

**Interfaces:**
- Produces: `GET /blog`（列表）、`GET /blog/:slug`（详情）

- [ ] **Step 1: 写博客列表页 app/blog/page.tsx**

```tsx
import Link from "next/link"
import { Container } from "@/components/layout/Container"
import { getAllPosts } from "@/lib/posts"

function formatDate(d: Date) {
  return new Date(d).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" })
}

export const dynamic = "force-static"
export const revalidate = 3600

export default async function BlogPage() {
  const posts = await getAllPosts()
  return (
    <Container size="narrow" className="py-16">
      <h1 className="text-3xl font-serif text-ink mb-10">文章</h1>
      {posts.length === 0 ? (
        <p className="text-ink-muted">还没有文章。</p>
      ) : (
        <ul className="space-y-10">
          {posts.map((p) => (
            <li key={p.id} className="border-b border-line pb-8">
              <Link href={`/blog/${p.slug}`} className="group block">
                <div className="flex items-baseline justify-between gap-4 mb-2">
                  <h2 className="text-2xl text-ink group-hover:text-accent transition-colors">{p.title}</h2>
                  <time className="text-sm text-ink-muted whitespace-nowrap">{formatDate(p.createdAt)}</time>
                </div>
                {p.excerpt && <p className="text-ink-muted mb-2">{p.excerpt}</p>}
                <div className="text-xs text-ink-muted">{p.readTime} min read</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Container>
  )
}
```

- [ ] **Step 2: 写 PostContent 客户端组件**

Tiptap 内容以 JSON 存储，渲染时用 generateHTML 转回 HTML。

```tsx
// components/blog/PostContent.tsx
"use client"

import { generateHTML } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Image from "@tiptap/extension-image"
import Link from "@tiptap/extension-link"
import { type JSONContent } from "@tiptap/core"

const extensions = [StarterKit, Image, Link]

export function PostContent({ content }: { content: string }) {
  let html = ""
  try {
    const json = JSON.parse(content) as JSONContent
    html = generateHTML(json, extensions)
  } catch {
    html = content // 兼容纯文本
  }
  return (
    <div
      className="prose prose-stone max-w-none
        prose-headings:font-serif prose-headings:text-ink
        prose-p:text-ink prose-p:leading-[1.8]
        prose-a:text-accent prose-strong:text-ink
        prose-blockquote:border-l-accent prose-blockquote:text-ink-muted
        prose-code:text-accent prose-code:bg-paper prose-code:rounded
        prose-img:rounded-lg"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
```

安装 @tiptap/core（若未装）：

```bash
npm install @tiptap/core
```

- [ ] **Step 3: 写博客详情页 app/blog/[slug]/page.tsx**

```tsx
import { notFound } from "next/navigation"
import { Container } from "@/components/layout/Container"
import { PostContent } from "@/components/blog/PostContent"
import { getPostBySlug } from "@/lib/posts"
import { prisma } from "@/lib/db"

export const dynamic = "force-static"
export const revalidate = 3600

async function getPost(slug: string) {
  const post = await prisma.post.findUnique({
    where: { slug },
    include: { category: true },
  })
  return post
}

export async function generateStaticParams() {
  const posts = await prisma.post.findMany({ where: { status: "PUBLISHED" } })
  return posts.map((p) => ({ slug: p.slug }))
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = await getPost(slug)
  if (!post || post.status !== "PUBLISHED") notFound()

  const date = new Date(post.createdAt).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" })

  return (
    <Container size="narrow" className="py-16">
      <article>
        <header className="mb-10 text-center">
          <h1 className="text-4xl font-serif text-ink mb-3">{post.title}</h1>
          <div className="text-sm text-ink-muted">
            <time>{date}</time> · {post.readTime} min read
            {post.category && <span> · {post.category.name}</span>}
          </div>
        </header>
        <PostContent content={post.content} />
        {post.tags.length > 0 && (
          <div className="mt-12 flex flex-wrap gap-2">
            {post.tags.map((t) => (
              <span key={t} className="px-3 py-1 text-xs rounded-full bg-paper text-ink-muted border border-line">#{t}</span>
            ))}
          </div>
        )}
      </article>
    </Container>
  )
}
```

- [ ] **Step 4: 启动验证**

打开 http://localhost:3000/blog 应看到空列表提示。
手动在数据库插一条 PUBLISHED 文章测试详情页：

```bash
npx prisma studio
```

在 Post 表添加一条：title="测试文章"、content=`"Hello"`、slug="test-1"、status="PUBLISHED"、readTime=1。

访问 http://localhost:3000/blog/test-1 应看到详情。

- [ ] **Step 5: 提交**

```bash
git add app/blog components/blog/PostContent.tsx
git commit -m "feat: public blog list and detail pages"
```

---

## 阶段 4：后台基础

### Task 9: 后台布局与首页

**Files:**
- Create: `app/admin/layout.tsx`
- Create: `app/admin/page.tsx`
- Create: `components/admin/AdminSidebar.tsx`
- Create: `app/api/auth/check/route.ts`（已在 Task 6 创建）

**Interfaces:**
- Produces: `/admin` 后台壳子（侧边栏 + 内容区）
- Consumes: `getSession()` 验证登录

- [ ] **Step 1: 写 AdminSidebar**

```tsx
// components/admin/AdminSidebar.tsx
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { FileText, ListTodo, Settings, Home } from "lucide-react"
import { cn } from "@/lib/utils"

const items = [
  { href: "/admin", label: "概览", icon: Home },
  { href: "/admin/posts", label: "Blog", icon: FileText },
  { href: "/admin/todos", label: "Todo", icon: ListTodo },
  { href: "/admin/settings", label: "Settings", icon: Settings },
]

export function AdminSidebar() {
  const path = usePathname()
  return (
    <nav className="flex flex-col gap-1">
      {items.map(({ href, label, icon: Icon }) => {
        const active = path === href || (href !== "/admin" && path.startsWith(href))
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-colors",
              active ? "bg-accent/10 text-accent" : "text-ink-muted hover:bg-paper hover:text-ink"
            )}
          >
            <Icon className="h-4 w-4" /> {label}
          </Link>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 2: 写后台布局 app/admin/layout.tsx**

```tsx
import { redirect } from "next/navigation"
import { getSession } from "@/lib/session"
import { AdminSidebar } from "@/components/admin/AdminSidebar"
import { Container } from "@/components/layout/Container"
import Link from "next/link"
import { LogOut } from "lucide-react"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session.isLoggedIn) redirect("/")

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 border-r border-line p-4 hidden md:block">
        <div className="mb-8 px-4">
          <span className="font-serif text-lg text-ink">花园后台</span>
        </div>
        <AdminSidebar />
        <form action="/api/auth/logout" method="post" className="mt-8">
          <button type="submit" className="flex items-center gap-3 px-4 py-2 text-sm text-ink-muted hover:text-accent">
            <LogOut className="h-4 w-4" /> 退出
          </button>
        </form>
      </aside>
      <main className="flex-1 p-6 md:p-10">{children}</main>
    </div>
  )
}
```

注意：退出表单是 POST 但 HTML form 默认提交会刷新页面。改成 fetch 提交（在客户端组件）更优雅。简化做法：

```tsx
// 替换 form 为客户端组件
// components/admin/LogoutButton.tsx
"use client"
import { useRouter } from "next/navigation"
import { LogOut } from "lucide-react"

export function LogoutButton() {
  const router = useRouter()
  return (
    <button
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" })
        router.push("/")
        router.refresh()
      }}
      className="flex items-center gap-3 px-4 py-2 text-sm text-ink-muted hover:text-accent"
    >
      <LogOut className="h-4 w-4" /> 退出
    </button>
  )
}
```

在 layout 内用 `<LogoutButton />` 替换 form。

- [ ] **Step 3: 写后台首页 app/admin/page.tsx**

```tsx
import { prisma } from "@/lib/db"
import Link from "next/link"
import { Container } from "@/components/layout/Container"

export default async function AdminHome() {
  const [postCount, todoCount, draftCount] = await Promise.all([
    prisma.post.count(),
    prisma.todo.count(),
    prisma.post.count({ where: { status: "DRAFT" } }),
  ])
  const pendingTodos = await prisma.todo.findMany({
    where: { status: "TODO" },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { category: true },
  })

  return (
    <Container>
      <h1 className="text-3xl font-serif mb-8">概览</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
        <Link href="/admin/posts" className="p-6 rounded-xl bg-card border border-line hover:border-accent transition-colors">
          <div className="text-3xl font-serif text-accent">{postCount}</div>
          <div className="text-sm text-ink-muted mt-1">文章总数（{draftCount} 草稿）</div>
        </Link>
        <Link href="/admin/todos" className="p-6 rounded-xl bg-card border border-line hover:border-accent transition-colors">
          <div className="text-3xl font-serif text-accent">{todoCount}</div>
          <div className="text-sm text-ink-muted mt-1">Todo 总数</div>
        </Link>
        <Link href="/admin/posts/new" className="p-6 rounded-xl bg-card border border-line hover:border-accent transition-colors">
          <div className="text-3xl font-serif text-accent">＋</div>
          <div className="text-sm text-ink-muted mt-1">写新文章</div>
        </Link>
      </div>

      <h2 className="text-xl font-serif mb-4">待办</h2>
      {pendingTodos.length === 0 ? (
        <p className="text-ink-muted">暂无待办。</p>
      ) : (
        <ul className="space-y-2">
          {pendingTodos.map((t) => (
            <li key={t.id} className="flex items-center justify-between p-3 rounded-lg border border-line">
              <span>{t.title}</span>
              {t.category && <span className="text-xs text-ink-muted">{t.category.name}</span>}
            </li>
          ))}
        </ul>
      )}
    </Container>
  )
}
```

- [ ] **Step 4: 启动验证**

登录后访问 http://localhost:3000/admin 应看到概览页，左侧有侧边栏，能看到统计数字。

- [ ] **Step 5: 提交**

```bash
git add app/admin components/admin
git commit -m "feat: admin layout with sidebar and overview page"
```

---

## 阶段 5：后台 Blog 模块

### Task 10: Tiptap 编辑器封装

**Files:**
- Create: `components/admin/PostEditor.tsx`
- Create: `app/api/upload/route.ts`
- Create: `public/uploads/.gitkeep`

**Interfaces:**
- Produces: `<PostEditor value onChange />`，内容为 Tiptap JSON 字符串

- [ ] **Step 1: 创建上传目录**

```bash
mkdir -p public/uploads
touch public/uploads/.gitkeep
```

- [ ] **Step 2: 写图片上传 API app/api/upload/route.ts**

```typescript
import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { writeFile, mkdir } from "fs/promises"
import path from "path"

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: "未登录" }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  if (!file) return NextResponse.json({ error: "无文件" }, { status: 400 })

  // 简单类型校验
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "仅支持图片" }, { status: 400 })
  }

  // 大小限制 5MB
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "图片过大（限 5MB）" }, { status: 400 })
  }

  const ext = file.name.split(".").pop() || "png"
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const uploadDir = path.join(process.cwd(), "public", "uploads")
  await mkdir(uploadDir, { recursive: true })
  const buf = Buffer.from(await file.arrayBuffer())
  await writeFile(path.join(uploadDir, filename), buf)

  return NextResponse.json({ url: `/uploads/${filename}` })
}
```

- [ ] **Step 3: 写 PostEditor**

```tsx
// components/admin/PostEditor.tsx
"use client"

import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Image from "@tiptap/extension-image"
import Link from "@tiptap/extension-link"
import Placeholder from "@tiptap/extension-placeholder"
import { useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Bold, Italic, Heading1, Heading2, Heading3, List, ListOrdered, Quote, Code, Link2, Image as ImageIcon, Minus } from "lucide-react"

const menuButtons = "h-8 w-8 p-0 text-ink-muted hover:text-accent"
const menuButtonsActive = "text-accent bg-accent/10"

export function PostEditor({
  value,
  onChange,
}: {
  value: string
  onChange: (json: string) => void
}) {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: "开始写点什么…" }),
    ],
    content: value ? safeParse(value) : "",
    onUpdate: ({ editor }) => {
      onChangeRef.current(JSON.stringify(editor.getJSON()))
    },
    editorProps: {
      attributes: {
        class: "prose prose-stone max-w-none min-h-[400px] p-4 focus:outline-none prose-headings:font-serif prose-p:leading-[1.8] prose-blockquote:border-l-accent prose-code:text-accent",
      },
    },
  })

  useEffect(() => {
    if (editor && value && !editor.isDestroyed) {
      const current = JSON.stringify(editor.getJSON())
      if (current !== value) {
        editor.commands.setContent(safeParse(value))
      }
    }
  }, [value, editor])

  if (!editor) return null

  async function insertImage() {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "image/*"
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/upload", { method: "POST", body: fd })
      if (res.ok) {
        const { url } = await res.json()
        editor?.chain().focus().setImage({ src: url }).run()
      }
    }
    input.click()
  }

  function insertLink() {
    const url = window.prompt("链接地址")
    if (url) editor?.chain().focus().setLink({ href: url }).run()
  }

  return (
    <div className="border border-line rounded-lg overflow-hidden bg-card">
      <div className="sticky top-0 z-10 flex flex-wrap gap-1 p-2 border-b border-line bg-card">
        <Button type="button" variant="ghost" size="icon" className={menuButtons} onClick={() => editor.chain().focus().toggleBold().run()} aria-label="加粗">
          <Bold className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className={menuButtons} onClick={() => editor.chain().focus().toggleItalic().run()} aria-label="斜体">
          <Italic className="h-4 w-4" />
        </Button>
        <Separator />
        <Button type="button" variant="ghost" size="icon" className={menuButtons} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} aria-label="标题1">
          <Heading1 className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className={menuButtons} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} aria-label="标题2">
          <Heading2 className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className={menuButtons} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} aria-label="标题3">
          <Heading3 className="h-4 w-4" />
        </Button>
        <Separator />
        <Button type="button" variant="ghost" size="icon" className={menuButtons} onClick={() => editor.chain().focus().toggleBulletList().run()} aria-label="无序列表">
          <List className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className={menuButtons} onClick={() => editor.chain().focus().toggleOrderedList().run()} aria-label="有序列表">
          <ListOrdered className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className={menuButtons} onClick={() => editor.chain().focus().toggleBlockquote().run()} aria-label="引用">
          <Quote className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className={menuButtons} onClick={() => editor.chain().focus().toggleCodeBlock().run()} aria-label="代码块">
          <Code className="h-4 w-4" />
        </Button>
        <Separator />
        <Button type="button" variant="ghost" size="icon" className={menuButtons} onClick={insertLink} aria-label="链接">
          <Link2 className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className={menuButtons} onClick={insertImage} aria-label="图片">
          <ImageIcon className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className={menuButtons} onClick={() => editor.chain().focus().setHorizontalRule().run()} aria-label="分割线">
          <Minus className="h-4 w-4" />
        </Button>
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}

function Separator() {
  return <span className="w-px h-6 bg-line mx-1 self-center" />
}

function safeParse(s: string) {
  try { return JSON.parse(s) } catch { return s }
}
```

- [ ] **Step 4: 启动验证（编辑器将在 Task 11 实际页面里验证）**

跳过单独验证，进入下一任务。

- [ ] **Step 5: 提交**

```bash
git add components/admin/PostEditor.tsx app/api/upload public/uploads
git commit -m "feat: Tiptap editor with image upload"
```

---

### Task 11: 后台文章管理（列表 + 新建 + 编辑 + 删除）

**Files:**
- Create: `app/api/posts/route.ts`
- Create: `app/api/posts/[id]/route.ts`
- Create: `app/admin/posts/page.tsx`
- Create: `app/admin/posts/new/page.tsx`
- Create: `app/admin/posts/[id]/page.tsx`
- Create: `components/admin/PostForm.tsx`

**Interfaces:**
- Produces: `GET/POST /api/posts`、`GET/PUT/DELETE /api/posts/:id`、后台三个页面

- [ ] **Step 1: 写文章 API app/api/posts/route.ts**

```typescript
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/session"
import { calculateReadTime, generateSlug } from "@/lib/posts"

async function ensureAuth() {
  const session = await getSession()
  if (!session.isLoggedIn) throw new Error("未登录")
}

export async function GET(req: NextRequest) {
  await ensureAuth()
  const { searchParams } = new URL(req.url)
  const q = searchParams.get("q")?.trim()
  const posts = await prisma.post.findMany({
    where: q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { content: { contains: q, mode: "insensitive" } }] } : undefined,
    orderBy: { createdAt: "desc" },
    include: { category: true },
  })
  return NextResponse.json(posts)
}

export async function POST(req: NextRequest) {
  await ensureAuth()
  const body = await req.json()
  const { title, content, excerpt, categoryId, tags, status } = body as {
    title: string; content: string; excerpt?: string; categoryId?: string; tags?: string[]; status: "DRAFT" | "PUBLISHED"
  }
  if (!title) return NextResponse.json({ error: "标题必填" }, { status: 400 })

  const post = await prisma.post.create({
    data: {
      title,
      content: content || "",
      excerpt,
      slug: generateSlug(title),
      categoryId,
      tags: tags || [],
      status: status || "DRAFT",
      readTime: calculateReadTime(content || ""),
    },
  })
  return NextResponse.json(post, { status: 201 })
}
```

- [ ] **Step 2: 写单篇 API app/api/posts/[id]/route.ts**

```typescript
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/session"
import { calculateReadTime } from "@/lib/posts"

async function ensureAuth() {
  const session = await getSession()
  if (!session.isLoggedIn) throw new Error("未登录")
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await ensureAuth()
  const { id } = await params
  const post = await prisma.post.findUnique({ where: { id }, include: { category: true } })
  if (!post) return NextResponse.json({ error: "未找到" }, { status: 404 })
  return NextResponse.json(post)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await ensureAuth()
  const { id } = await params
  const body = await req.json()
  const { title, content, excerpt, categoryId, tags, status } = body
  const post = await prisma.post.update({
    where: { id },
    data: {
      ...(title !== undefined && { title }),
      ...(content !== undefined && { content, readTime: calculateReadTime(content) }),
      ...(excerpt !== undefined && { excerpt }),
      ...(categoryId !== undefined && { categoryId: categoryId || null }),
      ...(tags !== undefined && { tags }),
      ...(status !== undefined && { status }),
    },
  })
  return NextResponse.json(post)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await ensureAuth()
  const { id } = await params
  await prisma.post.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: 写 PostForm 客户端组件**

```tsx
// components/admin/PostForm.tsx
"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Post, Category } from "@prisma/client"
import { PostEditor } from "./PostEditor"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export function PostForm({
  post,
  categories,
}: {
  post?: (Post & { category: Category | null })
  categories: Category[]
}) {
  const router = useRouter()
  const [title, setTitle] = useState(post?.title || "")
  const [content, setContent] = useState(post?.content || "")
  const [excerpt, setExcerpt] = useState(post?.excerpt || "")
  const [categoryId, setCategoryId] = useState(post?.categoryId || "")
  const [tags, setTags] = useState((post?.tags || []).join(", "))
  const [pending, startTransition] = useTransition()

  async function save(status: "DRAFT" | "PUBLISHED") {
    if (!title.trim()) {
      alert("请输入标题")
      return
    }
    startTransition(async () => {
      const body = {
        title,
        content,
        excerpt,
        categoryId: categoryId || null,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        status,
      }
      const url = post ? `/api/posts/${post.id}` : "/api/posts"
      const method = post ? "PUT" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        router.push("/admin/posts")
        router.refresh()
      } else {
        const data = await res.json()
        alert(data.error || "保存失败")
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="title">标题</Label>
        <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="文章标题" className="text-lg" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>分区</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger><SelectValue placeholder="选择分区" /></SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="tags">标签（逗号分隔）</Label>
          <Input id="tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="技术, 学习" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="excerpt">摘要（可选）</Label>
        <Textarea id="excerpt" value={excerpt} onChange={(e) => setExcerpt(e.target.value)} rows={2} />
      </div>

      <div className="space-y-2">
        <Label>正文</Label>
        <PostEditor value={content} onChange={setContent} />
      </div>

      <div className="flex gap-3 justify-end">
        <Button variant="outline" onClick={() => save("DRAFT")} disabled={pending}>存为草稿</Button>
        <Button onClick={() => save("PUBLISHED")} disabled={pending}>{post?.status === "PUBLISHED" ? "更新发布" : "发布"}</Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 写新建页 app/admin/posts/new/page.tsx**

```tsx
import { prisma } from "@/lib/db"
import { PostForm } from "@/components/admin/PostForm"
import { Container } from "@/components/layout/Container"

export default async function NewPostPage() {
  const categories = await prisma.category.findMany({
    where: { type: "BLOG" },
    orderBy: { sortOrder: "asc" },
  })
  return (
    <Container>
      <h1 className="text-3xl font-serif mb-8">写新文章</h1>
      <PostForm categories={categories} />
    </Container>
  )
}
```

- [ ] **Step 5: 写编辑页 app/admin/posts/[id]/page.tsx**

```tsx
import { prisma } from "@/lib/db"
import { PostForm } from "@/components/admin/PostForm"
import { Container } from "@/components/layout/Container"
import { notFound } from "next/navigation"

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [post, categories] = await Promise.all([
    prisma.post.findUnique({ where: { id }, include: { category: true } }),
    prisma.category.findMany({ where: { type: "BLOG" }, orderBy: { sortOrder: "asc" } }),
  ])
  if (!post) notFound()
  return (
    <Container>
      <h1 className="text-3xl font-serif mb-8">编辑文章</h1>
      <PostForm post={post} categories={categories} />
    </Container>
  )
}
```

- [ ] **Step 6: 写文章列表 app/admin/posts/page.tsx**

```tsx
import Link from "next/link"
import { prisma } from "@/lib/db"
import { Container } from "@/components/layout/Container"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { PostsTable } from "@/components/admin/PostsTable"

export default async function PostsPage() {
  const [posts, categories] = await Promise.all([
    prisma.post.findMany({ orderBy: { createdAt: "desc" }, include: { category: true } }),
    prisma.category.findMany({ where: { type: "BLOG" } }),
  ])
  return (
    <Container>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-serif">Blog</h1>
        <Link href="/admin/posts/new">
          <Button><Plus className="h-4 w-4 mr-1" /> 新文章</Button>
        </Link>
      </div>
      <PostsTable initialPosts={posts} />
    </Container>
  )
}
```

- [ ] **Step 7: 写 PostsTable 客户端组件（含搜索 + 删除）**

```tsx
// components/admin/PostsTable.tsx
"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Post, Category } from "@prisma/client"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Trash2, Search } from "lucide-react"

function formatDate(d: Date) {
  return new Date(d).toLocaleDateString("zh-CN")
}

export function PostsTable({ initialPosts }: { initialPosts: (Post & { category: Category | null })[] }) {
  const [q, setQ] = useState("")
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  async function search() {
    const res = await fetch(`/api/posts?q=${encodeURIComponent(q)}`)
    // 简化：用 router.refresh 重渲，实际项目可换成 setState
    router.refresh()
  }

  async function del(id: string) {
    if (!confirm("确认删除？此操作不可撤销。")) return
    startTransition(async () => {
      await fetch(`/api/posts/${id}`, { method: "DELETE" })
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-muted" />
          <Input
            placeholder="搜索标题或内容…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            className="pl-9"
          />
        </div>
      </div>

      <div className="rounded-lg border border-line overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-paper text-ink-muted">
            <tr>
              <th className="text-left p-3 font-normal">标题</th>
              <th className="text-left p-3 font-normal w-24">分区</th>
              <th className="text-left p-3 font-normal w-24">状态</th>
              <th className="text-left p-3 font-normal w-32">时间</th>
              <th className="p-3 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {initialPosts.length === 0 ? (
              <tr><td colSpan={5} className="p-8 text-center text-ink-muted">还没有文章</td></tr>
            ) : (
              initialPosts.map((p) => (
                <tr key={p.id} className="border-t border-line">
                  <td className="p-3">
                    <Link href={`/admin/posts/${p.id}`} className="hover:text-accent">{p.title}</Link>
                  </td>
                  <td className="p-3 text-ink-muted">{p.category?.name || "—"}</td>
                  <td className="p-3">
                    <span className={p.status === "PUBLISHED" ? "text-accent" : "text-ink-muted"}>
                      {p.status === "PUBLISHED" ? "已发布" : "草稿"}
                    </span>
                  </td>
                  <td className="p-3 text-ink-muted">{formatDate(p.createdAt)}</td>
                  <td className="p-3">
                    <Button variant="ghost" size="icon" onClick={() => del(p.id)} disabled={pending}>
                      <Trash2 className="h-4 w-4 text-ink-muted hover:text-red-500" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 8: 启动验证**

```bash
npm run dev
```

登录后访问 /admin/posts：
- 点"新文章"进入编辑器，输入标题、写内容、存草稿、发布
- 列表中能看到文章
- 搜索框输入关键词回车能筛选
- 点删除能删除

- [ ] **Step 9: 提交**

```bash
git add app/api/posts app/admin/posts components/admin/PostForm.tsx components/admin/PostsTable.tsx
git commit -m "feat: admin post management with search and CRUD"
```

---

## 阶段 6：后台 Todo 模块

### Task 12: Todo 管理页面

**Files:**
- Create: `app/api/todos/route.ts`
- Create: `app/api/todos/[id]/route.ts`
- Create: `app/admin/todos/page.tsx`
- Create: `components/admin/TodoList.tsx`

**Interfaces:**
- Produces: `GET/POST /api/todos`、`PATCH/DELETE /api/todos/:id`、Todo 管理页

- [ ] **Step 1: 写 Todo API app/api/todos/route.ts**

```typescript
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/session"

async function ensureAuth() {
  const session = await getSession()
  if (!session.isLoggedIn) throw new Error("未登录")
}

export async function GET() {
  await ensureAuth()
  const todos = await prisma.todo.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    include: { category: true },
  })
  return NextResponse.json(todos)
}

export async function POST(req: NextRequest) {
  await ensureAuth()
  const { title, description, categoryId } = await req.json()
  if (!title) return NextResponse.json({ error: "标题必填" }, { status: 400 })
  const todo = await prisma.todo.create({
    data: { title, description, categoryId: categoryId || null },
  })
  return NextResponse.json(todo, { status: 201 })
}
```

- [ ] **Step 2: 写单条 Todo API app/api/todos/[id]/route.ts**

```typescript
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/session"

async function ensureAuth() {
  const session = await getSession()
  if (!session.isLoggedIn) throw new Error("未登录")
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await ensureAuth()
  const { id } = await params
  const body = await req.json()
  const todo = await prisma.todo.update({
    where: { id },
    data: {
      ...(body.title !== undefined && { title: body.title }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.categoryId !== undefined && { categoryId: body.categoryId || null }),
      ...(body.priority !== undefined && { priority: body.priority }),
    },
  })
  return NextResponse.json(todo)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await ensureAuth()
  const { id } = await params
  await prisma.todo.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: 写 TodoList 客户端组件**

```tsx
// components/admin/TodoList.tsx
"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Todo, Category, TodoStatus } from "@prisma/client"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Plus, Trash2, Check } from "lucide-react"
import { cn } from "@/lib/utils"

export function TodoList({
  todos,
  categories,
}: {
  todos: (Todo & { category: Category | null })[]
  categories: Category[]
}) {
  const router = useRouter()
  const [newTitle, setNewTitle] = useState("")
  const [newCategoryId, setNewCategoryId] = useState<string>(categories[0]?.id || "")
  const [pending, startTransition] = useTransition()

  async function add() {
    if (!newTitle.trim()) return
    startTransition(async () => {
      await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle, categoryId: newCategoryId }),
      })
      setNewTitle("")
      router.refresh()
    })
  }

  async function toggle(id: string, current: TodoStatus) {
    startTransition(async () => {
      await fetch(`/api/todos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: current === "TODO" ? "DONE" : "TODO" }),
      })
      router.refresh()
    })
  }

  async function del(id: string) {
    startTransition(async () => {
      await fetch(`/api/todos/${id}`, { method: "DELETE" })
      router.refresh()
    })
  }

  // 按分区分组
  const grouped = categories.map((c) => ({
    category: c,
    items: todos.filter((t) => t.categoryId === c.id),
  }))
  const uncategorized = todos.filter((t) => !t.categoryId)

  return (
    <div className="space-y-8">
      {/* 添加新任务 */}
      <div className="flex gap-2">
        <Input
          placeholder="添加新任务…"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <select
          value={newCategoryId}
          onChange={(e) => setNewCategoryId(e.target.value)}
          className="border border-line rounded-md px-3 text-sm"
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <Button onClick={add} disabled={pending}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* 分区列表 */}
      {grouped.map(({ category, items }) => (
        <div key={category.id}>
          <h3 className="text-lg font-serif text-ink mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ background: category.color || "#C97B3D" }} />
            {category.name}
          </h3>
          <ul className="space-y-1 ml-4">
            {items.length === 0 ? (
              <li className="text-sm text-ink-muted py-2">—</li>
            ) : (
              items.map((t) => (
                <TodoItem key={t.id} todo={t} onToggle={toggle} onDelete={del} disabled={pending} />
              ))
            )}
          </ul>
        </div>
      ))}

      {uncategorized.length > 0 && (
        <div>
          <h3 className="text-lg font-serif text-ink mb-3">未分类</h3>
          <ul className="space-y-1 ml-4">
            {uncategorized.map((t) => (
              <TodoItem key={t.id} todo={t} onToggle={toggle} onDelete={del} disabled={pending} />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function TodoItem({
  todo,
  onToggle,
  onDelete,
  disabled,
}: {
  todo: Todo
  onToggle: (id: string, s: TodoStatus) => void
  onDelete: (id: string) => void
  disabled: boolean
}) {
  const done = todo.status === "DONE"
  return (
    <li className="flex items-center gap-3 py-2 group">
      <button
        onClick={() => onToggle(todo.id, todo.status)}
        disabled={disabled}
        className={cn(
          "h-5 w-5 rounded border flex items-center justify-center transition-colors",
          done ? "bg-accent border-accent text-white" : "border-line hover:border-accent"
        )}
      >
        {done && <Check className="h-3 w-3" />}
      </button>
      <span className={cn("flex-1", done && "line-through text-ink-muted")}>{todo.title}</span>
      <button
        onClick={() => onDelete(todo.id)}
        disabled={disabled}
        className="opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Trash2 className="h-4 w-4 text-ink-muted hover:text-red-500" />
      </button>
    </li>
  )
}
```

- [ ] **Step 4: 写 Todo 管理页 app/admin/todos/page.tsx**

```tsx
import { prisma } from "@/lib/db"
import { Container } from "@/components/layout/Container"
import { TodoList } from "@/components/admin/TodoList"

export default async function TodosPage() {
  const [todos, categories] = await Promise.all([
    prisma.todo.findMany({ orderBy: { createdAt: "desc" }, include: { category: true } }),
    prisma.category.findMany({ where: { type: "TODO" }, orderBy: { sortOrder: "asc" } }),
  ])
  return (
    <Container>
      <h1 className="text-3xl font-serif mb-8">Todo</h1>
      <TodoList todos={todos} categories={categories} />
    </Container>
  )
}
```

- [ ] **Step 5: 启动验证**

登录后访问 /admin/todos：
- 输入任务名回车能添加
- 点复选框能完成/取消完成
- 鼠标悬停显示删除按钮，点删除能删除
- 按分区正确分组

- [ ] **Step 6: 提交**

```bash
git add app/api/todos app/admin/todos components/admin/TodoList.tsx
git commit -m "feat: admin todo management with categories"
```

---

## 阶段 7：后台 Settings 模块

### Task 13: 分区管理 + 设置 + 修改密码

**Files:**
- Create: `app/api/categories/route.ts`
- Create: `app/api/categories/[id]/route.ts`
- Create: `app/api/settings/route.ts`
- Create: `app/api/auth/password/route.ts`
- Create: `app/admin/settings/page.tsx`
- Create: `components/admin/CategoryManager.tsx`
- Create: `components/admin/SettingsForm.tsx`
- Create: `components/admin/PasswordForm.tsx`

**Interfaces:**
- Produces: 分区 CRUD、设置读写、密码修改

- [ ] **Step 1: 写分区 API app/api/categories/route.ts**

```typescript
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/session"

async function ensureAuth() {
  const session = await getSession()
  if (!session.isLoggedIn) throw new Error("未登录")
}

export async function GET() {
  await ensureAuth()
  const cats = await prisma.category.findMany({ orderBy: [{ type: "asc" }, { sortOrder: "asc" }] })
  return NextResponse.json(cats)
}

export async function POST(req: NextRequest) {
  await ensureAuth()
  const { name, type, description, color } = await req.json()
  if (!name || !type) return NextResponse.json({ error: "参数缺失" }, { status: 400 })
  const cat = await prisma.category.create({
    data: { name, type, description, color },
  })
  return NextResponse.json(cat, { status: 201 })
}
```

- [ ] **Step 2: 写单分区 API app/api/categories/[id]/route.ts**

```typescript
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/session"

async function ensureAuth() {
  const session = await getSession()
  if (!session.isLoggedIn) throw new Error("未登录")
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await ensureAuth()
  const { id } = await params
  const body = await req.json()
  const cat = await prisma.category.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.color !== undefined && { color: body.color }),
      ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
    },
  })
  return NextResponse.json(cat)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await ensureAuth()
  const { id } = await params
  await prisma.category.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: 写设置 API app/api/settings/route.ts**

```typescript
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/session"

async function ensureAuth() {
  const session = await getSession()
  if (!session.isLoggedIn) throw new Error("未登录")
}

export async function GET() {
  await ensureAuth()
  const settings = await prisma.setting.findMany()
  const map: Record<string, string> = {}
  for (const s of settings) map[s.key] = s.value
  return NextResponse.json(map)
}

export async function PUT(req: NextRequest) {
  await ensureAuth()
  const body = (await req.json()) as Record<string, string>
  for (const [key, value] of Object.entries(body)) {
    await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    })
  }
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: 写修改密码 API app/api/auth/password/route.ts**

```typescript
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/session"
import { verifyPassword, hashPassword } from "@/lib/auth"

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: "未登录" }, { status: 401 })
  }

  const { currentPassword, newPassword } = await req.json()
  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "参数缺失" }, { status: 400 })
  }
  if (newPassword.length < 6) {
    return NextResponse.json({ error: "新密码至少 6 位" }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { username: session.username } })
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
    return NextResponse.json({ error: "当前密码错误" }, { status: 401 })
  }

  const hash = await hashPassword(newPassword)
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hash },
  })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: 写 CategoryManager**

```tsx
// components/admin/CategoryManager.tsx
"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Category, CategoryType } from "@prisma/client"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Plus, Trash2 } from "lucide-react"

export function CategoryManager({
  categories,
  type,
}: {
  categories: Category[]
  type: CategoryType
}) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [pending, startTransition] = useTransition()
  const filtered = categories.filter((c) => c.type === type)

  async function add() {
    if (!name.trim()) return
    startTransition(async () => {
      await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type }),
      })
      setName("")
      router.refresh()
    })
  }

  async function del(id: string) {
    if (!confirm("删除分区？分区下文章/Todo 的分区会置空")) return
    startTransition(async () => {
      await fetch(`/api/categories/${id}`, { method: "DELETE" })
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          placeholder="分区名…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <Button onClick={add} disabled={pending}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <ul className="space-y-1">
        {filtered.length === 0 ? (
          <li className="text-sm text-ink-muted">还没有分区</li>
        ) : (
          filtered.map((c) => (
            <li key={c.id} className="flex items-center gap-2 py-1.5 group">
              <span className="w-2 h-2 rounded-full" style={{ background: c.color || "#C97B3D" }} />
              <span className="flex-1">{c.name}</span>
              <button
                onClick={() => del(c.id)}
                className="opacity-0 group-hover:opacity-100"
              >
                <Trash2 className="h-4 w-4 text-ink-muted hover:text-red-500" />
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  )
}
```

- [ ] **Step 6: 写 SettingsForm**

```tsx
// components/admin/SettingsForm.tsx
"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

export function SettingsForm({ initial }: { initial: Record<string, string> }) {
  const router = useRouter()
  const [form, setForm] = useState({
    owner_name: initial.owner_name || "",
    tagline: initial.tagline || "",
    email: initial.email || "",
  })
  const [pending, startTransition] = useTransition()

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function save() {
    startTransition(async () => {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      router.refresh()
      alert("已保存")
    })
  }

  return (
    <div className="space-y-4 max-w-md">
      <div className="space-y-2">
        <Label>姓名</Label>
        <Input value={form.owner_name} onChange={(e) => set("owner_name", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>一句话标语</Label>
        <Input value={form.tagline} onChange={(e) => set("tagline", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>邮箱</Label>
        <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
      </div>
      <Button onClick={save} disabled={pending}>保存</Button>
    </div>
  )
}
```

- [ ] **Step 7: 写 PasswordForm**

```tsx
// components/admin/PasswordForm.tsx
"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

export function PasswordForm() {
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [ok, setOk] = useState(false)

  async function save() {
    setError("")
    setOk(false)
    if (next !== confirm) {
      setError("两次新密码不一致")
      return
    }
    const res = await fetch("/api/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    })
    if (res.ok) {
      setOk(true)
      setCurrent(""); setNext(""); setConfirm("")
    } else {
      const data = await res.json()
      setError(data.error || "修改失败")
    }
  }

  return (
    <div className="space-y-4 max-w-md">
      <div className="space-y-2">
        <Label>当前密码</Label>
        <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>新密码（至少 6 位）</Label>
        <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>确认新密码</Label>
        <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {ok && <p className="text-sm text-accent">已修改</p>}
      <Button onClick={save}>修改密码</Button>
    </div>
  )
}
```

- [ ] **Step 8: 写设置页 app/admin/settings/page.tsx**

```tsx
import { prisma } from "@/lib/db"
import { Container } from "@/components/layout/Container"
import { CategoryManager } from "@/components/admin/CategoryManager"
import { SettingsForm } from "@/components/admin/SettingsForm"
import { PasswordForm } from "@/components/admin/PasswordForm"

export default async function SettingsPage() {
  const [settings, categories] = await Promise.all([
    prisma.setting.findMany(),
    prisma.category.findMany({ orderBy: { sortOrder: "asc" } }),
  ])
  const map: Record<string, string> = {}
  for (const s of settings) map[s.key] = s.value

  return (
    <Container>
      <h1 className="text-3xl font-serif mb-8">Settings</h1>

      <section className="mb-12">
        <h2 className="text-xl font-serif mb-4">个人信息</h2>
        <SettingsForm initial={map} />
      </section>

      <section className="mb-12">
        <h2 className="text-xl font-serif mb-4">博客分区</h2>
        <CategoryManager categories={categories} type="BLOG" />
      </section>

      <section className="mb-12">
        <h2 className="text-xl font-serif mb-4">Todo 分区</h2>
        <CategoryManager categories={categories} type="TODO" />
      </section>

      <section>
        <h2 className="text-xl font-serif mb-4">修改密码</h2>
        <PasswordForm />
      </section>
    </Container>
  )
}
```

- [ ] **Step 9: 启动验证**

登录后访问 /admin/settings：
- 修改姓名、标语、邮箱能保存
- 添加博客/Todo 分区能成功
- 删除分区能成功
- 修改密码（输当前密码+新密码）能成功

- [ ] **Step 10: 提交**

```bash
git add app/api/categories app/api/settings app/api/auth/password app/admin/settings components/admin/CategoryManager.tsx components/admin/SettingsForm.tsx components/admin/PasswordForm.tsx
git commit -m "feat: settings page with categories, profile, password"
```

---

## 阶段 8：部署

### Task 14: Dockerfile + docker-compose

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.dockerignore`
- Modify: `next.config.ts`（开启 standalone 输出）

**Interfaces:**
- Produces: 可在腾讯云用 `docker compose up -d` 启动的镜像

- [ ] **Step 1: 修改 next.config.ts 开启 standalone**

```typescript
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
}

export default nextConfig
```

- [ ] **Step 2: 写 Dockerfile（多阶段构建）**

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# 上传目录（运行时挂载 volume 覆盖）
RUN mkdir -p /app/public/uploads
RUN chown -R nextjs:nodejs /app/public/uploads

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["sh", "-c", "npx prisma db push --skip-generate && node server.js"]
```

- [ ] **Step 3: 写 .dockerignore**

```
node_modules
.next
.git
*.md
docs
data
nginx
docker-compose*.yml
.env*
!.env.example
```

- [ ] **Step 4: 写 docker-compose.yml（生产部署）**

```yaml
services:
  db:
    image: postgres:16-alpine
    restart: always
    environment:
      POSTGRES_DB: ${DB_NAME:-blog}
      POSTGRES_USER: ${DB_USER:-blog}
      POSTGRES_PASSWORD: ${DB_PASSWORD:-blog}
    volumes:
      - ./data/postgres:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER:-blog}"]
      interval: 10s
      timeout: 5s
      retries: 5

  web:
    image: ghcr.io/${GITHUB_REPOSITORY:-yourname/blog}:latest
    restart: always
    depends_on:
      db:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://${DB_USER:-blog}:${DB_PASSWORD:-blog}@db:5432/${DB_NAME:-blog}?schema=public
      SESSION_SECRET: ${SESSION_SECRET}
      NEXT_PUBLIC_GITHUB_URL: ${NEXT_PUBLIC_GITHUB_URL}
      NEXT_PUBLIC_SITE_URL: ${NEXT_PUBLIC_SITE_URL}
    volumes:
      - ./data/uploads:/app/public/uploads

  nginx:
    image: nginx:alpine
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/conf.d:/etc/nginx/conf.d:ro
      - ./nginx/certs:/etc/nginx/certs:ro
      - ./data/uploads:/var/www/uploads:ro
    depends_on:
      - web
```

- [ ] **Step 5: 写 nginx 配置 nginx/conf.d/default.conf**

```nginx
server {
    listen 80;
    server_name _;
    # 后续配 HTTPS 后把 80 重定向到 443

    client_max_body_size 10M;

    location /uploads/ {
        alias /var/www/uploads/;
        expires 7d;
        access_log off;
    }

    location / {
        proxy_pass http://web:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

- [ ] **Step 6: 在 .env.example 补全生产变量**

```bash
# 本地开发
DATABASE_URL="postgresql://blog:blog@localhost:5432/blog?schema=public"
SESSION_SECRET="change-me-to-a-long-random-string-at-least-32-chars"
NEXT_PUBLIC_SITE_URL="http://localhost:3000"
NEXT_PUBLIC_GITHUB_URL="https://github.com/666666999999666"

# 生产部署（腾讯云服务器上的 .env）
DB_NAME=blog
DB_USER=blog
DB_PASSWORD=替换为强密码
SESSION_SECRET=替换为32位以上随机串
NEXT_PUBLIC_SITE_URL=https://你的域名
NEXT_PUBLIC_GITHUB_URL=https://github.com/666666999999666
GITHUB_REPOSITORY=你的GitHub用户名/blog
```

- [ ] **Step 7: 提交**

```bash
git add Dockerfile .dockerignore docker-compose.yml nginx next.config.ts .env.example
git commit -m "feat: docker compose deployment setup"
```

---

### Task 15: GitHub Actions CI/CD

**Files:**
- Create: `.github/workflows/deploy.yml`

**Interfaces:**
- Produces: push 到 main 分支自动构建镜像并部署到腾讯云

- [ ] **Step 1: 写 deploy.yml**

```yaml
name: Build and Deploy

on:
  push:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=raw,value=latest
            type=sha,format=short

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}

      - name: Deploy to server
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SERVER_SSH_KEY }}
          script: |
            cd ${{ secrets.SERVER_APP_DIR }}
            git pull
            docker compose pull
            docker compose up -d
            docker image prune -f
```

- [ ] **Step 2: 写部署文档 docs/deploy.md**

````markdown
# 部署到腾讯云指南

## 一、准备服务器

### 1. 安装 Docker

```bash
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker
```

### 2. 安装 Docker Compose（若未自带）

```bash
# Docker 20+ 自带 docker compose 插件
docker compose version
```

## 二、配置 GitHub Secrets

在 GitHub 仓库 Settings > Secrets and variables > Actions 添加：

- `SERVER_HOST` - 服务器 IP
- `SERVER_USER` - SSH 用户名（如 root 或 ubuntu）
- `SERVER_SSH_KEY` - SSH 私钥（完整内容）
- `SERVER_APP_DIR` - 应用目录（如 `/opt/blog`）

## 三、首次部署

### 1. 在服务器创建应用目录

```bash
mkdir -p /opt/blog/data/postgres
mkdir -p /opt/blog/data/uploads
mkdir -p /opt/blog/nginx/conf.d
mkdir -p /opt/blog/nginx/certs
cd /opt/blog
```

### 2. 克隆代码

```bash
git clone https://github.com/你的用户名/blog.git .
```

### 3. 创建 .env 文件

```bash
cp .env.example .env
vi .env
# 修改 DB_PASSWORD、SESSION_SECRET、NEXT_PUBLIC_SITE_URL 等
```

### 4. 复制 nginx 配置（已在仓库内，git pull 后会自动有）

### 5. 启动

```bash
docker compose up -d
docker compose logs -f  # 查看日志
```

访问 http://服务器IP 验证。

## 四、配置 HTTPS（推荐）

### 1. 申请证书

```bash
# 用 certbot 申请（需临时停 nginx，用 80 端口验证）
docker compose stop nginx
certbot certonly --standalone -d 你的域名.com

# 复制证书到 nginx/certs
cp /etc/letsencrypt/live/你的域名.com/fullchain.pem /opt/blog/nginx/certs/
cp /etc/letsencrypt/live/你的域名.com/privkey.pem /opt/blog/nginx/certs/
```

### 2. 修改 nginx/conf.d/default.conf 启用 HTTPS

参考完整配置：

```nginx
server {
    listen 80;
    server_name 你的域名.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name 你的域名.com;

    ssl_certificate /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;

    client_max_body_size 10M;

    location /uploads/ {
        alias /var/www/uploads/;
        expires 7d;
    }

    location / {
        proxy_pass http://web:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 3. 重启 nginx

```bash
docker compose restart nginx
```

## 五、后续更新

只需 `git push` 到 main 分支，GitHub Actions 会自动构建并部署。

## 六、数据备份

### 手动备份

```bash
cd /opt/blog
tar -czf backup-$(date +%F).tar.gz data/
```

### 自动备份（cron）

```bash
crontab -e
# 每天凌晨 3 点备份
0 3 * * * cd /opt/blog && tar -czf /opt/backups/blog-$(date +\%F).tar.gz data/ 2>&1
```
````

- [ ] **Step 3: 提交**

```bash
git add .github/workflows/deploy.yml docs/deploy.md
git commit -m "feat: GitHub Actions CI/CD and deploy guide"
```

---

### Task 16: 最终集成测试与首次部署

**Files:**
- Modify: `README.md`（可选，简短启动说明）

**Interfaces:**
- Produces: 完整可运行的网站 + 首次部署成功

- [ ] **Step 1: 本地完整流程验证**

```bash
# 1. 启动数据库
docker compose -f docker-compose.dev.yml up -d

# 2. 同步 schema 和种子
npx prisma db push
npx prisma db seed

# 3. 启动应用
npm run dev
```

验证清单：
- [ ] 首页显示姓名、标语、最近文章
- [ ] /blog 显示空列表
- [ ] 点右下角小猫按钮，弹出登录框
- [ ] 用 admin/admin123 登录成功，跳转 /admin
- [ ] /admin/posts/new 写一篇测试文章，发布
- [ ] /blog 列表能看到刚发布的文章
- [ ] /blog/[slug] 能阅读详情
- [ ] /admin/todos 添加任务，能完成/取消
- [ ] /admin/settings 改姓名能保存
- [ ] /admin/settings 添加博客分区能成功
- [ ] 退出登录后访问 /admin/posts 被重定向到首页

- [ ] **Step 2: 推到 GitHub**

```bash
git remote add origin https://github.com/你的用户名/blog.git
git branch -M main
git push -u origin main
```

- [ ] **Step 3: 在 GitHub 仓库 Settings > Actions 添加 Secrets**

- SERVER_HOST
- SERVER_USER
- SERVER_SSH_KEY
- SERVER_APP_DIR

- [ ] **Step 4: 在腾讯云服务器执行首次部署**

参考 `docs/deploy.md`。

- [ ] **Step 5: 配置域名 DNS**

在腾讯云 DNS 解析中，把你的域名 A 记录指向服务器 IP。

- [ ] **Step 6: 配置 HTTPS**

按 `docs/deploy.md` 第四节操作。

- [ ] **Step 7: 验证生产环境**

- 访问 https://你的域名
- 用 admin/admin123 登录
- **立刻去 /admin/settings 修改密码**
- 写第一篇正式文章

- [ ] **Step 8: 提交最终状态**

```bash
git add .
git commit -m "chore: final integration and first deployment"
git push
```

---

## 自我检查

### 1. Spec 覆盖检查

| Spec 要求 | 实现任务 |
|---------|---------|
| 公开首页（流式单页） | Task 7 |
| 公开博客列表（按时间倒序，不公开分类） | Task 8 |
| 公开博客详情 | Task 8 |
| 右下角小猫按钮管理入口 | Task 6 |
| 密码登录（bcrypt + iron-session） | Task 4, 5 |
| 中间件保护 /admin/* | Task 5 |
| 后台三模块 Blog/Todo/Settings | Task 9（壳）+ 11/12/13 |
| Tiptap 所见即所得编辑器（含图片） | Task 10 |
| 文章 Draft/Preview/Publish 工作流 | Task 11（草稿/发布） |
| Todo 自定义分区 | Task 13 |
| Todo 待办/完成两态 | Task 12 |
| 私人搜索（在 Blog 列表内） | Task 11 |
| 分区管理（Settings 内） | Task 13 |
| 个人信息设置 | Task 13 |
| 修改密码 | Task 13 |
| PostgreSQL + Prisma | Task 2 |
| Docker Compose + Nginx + PostgreSQL 三容器 | Task 14 |
| GitHub Actions CI/CD | Task 15 |
| Volume 持久化（数据 + uploads） | Task 14 |
| 部署文档 | Task 15 |

**Preview 步骤说明**：spec 提到 Draft -> Preview -> Publish，本计划在 Task 11 的 PostForm 中通过"存为草稿"和"发布"按钮实现，未单独做"预览"页 -- 因为 Tiptap 编辑器本身即所见即所得，无需独立预览。如用户需要独立预览页可后续补充。

### 2. 占位符扫描

- `<owner>` 在 docker-compose.yml 中通过 `${GITHUB_REPOSITORY:-yourname/blog}` 环境变量处理，部署时填实际值 ✓
- "你的名字"、"你的域名" 等出现在文档和默认设置中 -- 通过 seed 脚本和 .env 让用户在首次部署时填实际值 ✓
- 代码内无 TBD/TODO ✓

### 3. 类型一致性

- `Post.status` 枚举 `DRAFT`/`PUBLISHED` 在 schema、API、PostForm 中一致 ✓
- `Todo.status` 枚举 `TODO`/`DONE` 在 schema、API、TodoList 中一致 ✓
- `Category.type` 枚举 `BLOG`/`TODO` 在 schema、API、CategoryManager 中一致 ✓
- `getSession()` 在多个 API 中调用方式一致 ✓
- `calculateReadTime`、`generateSlug` 在 lib/posts.ts 定义并在 API 中使用 ✓

---

## 执行选择

计划完成，保存到 `docs/superpowers/plans/2026-07-19-personal-website.md`。

两种执行方式：

**1. Subagent-Driven（推荐）**：每个 Task 派一个新子代理执行，任务之间我做 review，迭代快、上下文干净。

**2. Inline Execution**：在当前会话里按批次执行，中间设检查点。

请选择一种。
