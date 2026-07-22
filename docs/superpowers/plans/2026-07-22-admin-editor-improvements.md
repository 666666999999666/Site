# 后台与编辑器改进 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复5个用户反馈问题：标语字段清理、博客发布时间可编辑、阅读时间计算修复、博客副标题文案更新、编辑器深色模式修复。

**Architecture:** 最小改动原则，每个问题独立修改2-3个文件。问题2（发布时间）涉及 schema 变更需要 db push，其余均为纯代码修改。

**Tech Stack:** Next.js 16, Prisma 7, Tiptap, Tailwind CSS v4, next-intl

## Global Constraints

- Prisma 7 不支持 `db push --skip-generate`，使用 `npx prisma db push` 同步表结构
- Next.js 16 使用 `proxy.ts` 而非 `middleware.ts`
- Tiptap 内容存储为 JSON 格式，不是 HTML
- 深色模式通过 `.dark` 类切换（`@custom-variant dark (&:is(.dark *))`）
- 翻译文件在 `messages/zh.json` 和 `messages/en.json`

---

### Task 1: 删除无用的 tagline 字段

**Files:**
- Modify: `components/admin/SettingsForm.tsx:12-14` — 删除 tagline 字段
- Modify: `prisma/seed.ts:21-25` — 删除 tagline 种子数据

**Interfaces:**
- Consumes: 现有 SettingsForm 表单结构
- Produces: 无下游依赖（tagline 本身就没有消费者）

- [ ] **Step 1: 从 SettingsForm 删除 tagline 字段**

在 `components/admin/SettingsForm.tsx` 中，删除 form state 中的 `tagline` 行和对应的输入框：

form state 中删除第14行：
```
tagline: initial.tagline || "",
```

删除第45-48行的输入框：
```tsx
      <div className="space-y-2">
        <Label>一句话标语</Label>
        <Input value={form.tagline} onChange={(e) => set("tagline", e.target.value)} />
      </div>
```

- [ ] **Step 2: 从 seed.ts 删除 tagline 种子数据**

在 `prisma/seed.ts` 中，删除第21-25行：
```typescript
  await prisma.setting.upsert({
    where: { key: 'tagline' },
    update: {},
    create: { key: 'tagline', value: '今天也想写点什么' },
  })
```

- [ ] **Step 3: 构建验证**

Run: `npx next build`
Expected: 构建成功，无错误

- [ ] **Step 4: Commit**

```bash
git add components/admin/SettingsForm.tsx prisma/seed.ts
git commit -m "fix: remove unused tagline field from settings"
```

---

### Task 2: 博客添加发布时间字段

**Files:**
- Modify: `prisma/schema.prisma:29-45` — Post 模型新增 publishedAt
- Modify: `components/admin/PostForm.tsx` — 新增发布时间输入框
- Modify: `app/api/posts/route.ts:37-48` — 创建时处理 publishedAt
- Modify: `app/api/posts/[id]/route.ts:20-38` — 更新时处理 publishedAt
- Modify: `components/blog/BlogCard.tsx:35` — 展示用 publishedAt ?? createdAt
- Modify: `components/home/RecentPosts.tsx:59` — 展示用 publishedAt ?? createdAt
- Modify: `app/[locale]/blog/[slug]/page.tsx:76-79` — 展示用 publishedAt ?? createdAt
- Modify: `prisma/seed.ts` — 无需改（publishedAt 可选，默认 null）

**Interfaces:**
- Consumes: Post Prisma 模型
- Produces: Post.publishedAt 可选字段，前台统一使用 `post.publishedAt ?? post.createdAt` 显示日期

- [ ] **Step 1: Prisma schema 新增 publishedAt**

在 `prisma/schema.prisma` 的 Post 模型中，在 `readTime` 后面添加：

```prisma
  publishedAt DateTime?
```

完整的 Post 模型变为：
```prisma
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
  publishedAt DateTime?
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  @@index([status, createdAt])
  @@index([categoryId])
}
```

- [ ] **Step 2: 同步数据库表结构**

Run: `npx prisma db push`
Expected: 成功，新增 publishedAt 列

- [ ] **Step 3: PostForm 添加发布时间输入框**

在 `components/admin/PostForm.tsx` 中：

1. 在 useState 部分新增 publishedAt 状态（第26行后）：
```typescript
  const [publishedAt, setPublishedAt] = useState(
    post?.publishedAt ? new Date(post.publishedAt).toISOString().slice(0, 16) : ""
  )
```

2. 在 save 函数的 body 对象中添加 publishedAt（第42行后）：
```typescript
        publishedAt: publishedAt || null,
```

3. 在表单中，在「标签」和「摘要」之间添加发布时间输入框（第85行后，第86行前）：
```tsx
      <div className="space-y-2">
        <Label htmlFor="publishedAt">发布时间</Label>
        <Input
          id="publishedAt"
          type="datetime-local"
          value={publishedAt}
          onChange={(e) => setPublishedAt(e.target.value)}
        />
      </div>
```

- [ ] **Step 4: API 创建接口处理 publishedAt**

在 `app/api/posts/route.ts` 的 POST handler 中：

1. 解构 body 时添加 `publishedAt`：
```typescript
    const { title, content, excerpt, categoryId, tags, status, publishedAt } = body as {
      title: string; content: string; excerpt?: string; categoryId?: string; tags?: string[]; status: "DRAFT" | "PUBLISHED"; publishedAt?: string
    }
```

2. 在 prisma.post.create 的 data 中添加：
```typescript
        publishedAt: publishedAt ? new Date(publishedAt) : new Date(),
```

- [ ] **Step 5: API 更新接口处理 publishedAt**

在 `app/api/posts/[id]/route.ts` 的 PUT handler 中：

1. 解构 body 时添加 `publishedAt`：
```typescript
    const { title, content, excerpt, categoryId, tags, status, publishedAt } = body
```

2. 在条件赋值部分添加：
```typescript
    if (publishedAt !== undefined) data.publishedAt = publishedAt ? new Date(publishedAt) : null
```

- [ ] **Step 6: 前台组件使用 publishedAt ?? createdAt**

**BlogCard.tsx** 第35行，将：
```tsx
  <time>{formatDate(post.createdAt, locale)}</time>
```
改为：
```tsx
  <time>{formatDate(post.publishedAt ?? post.createdAt, locale)}</time>
```

**RecentPosts.tsx** 第59行，将：
```tsx
  <time>{formatDate(p.createdAt, locale)}</time>
```
改为：
```tsx
  <time>{formatDate(p.publishedAt ?? p.createdAt, locale)}</time>
```

**blog/[slug]/page.tsx** 第76-79行，将：
```typescript
  const date = new Date(post.createdAt).toLocaleDateString(
```
改为：
```typescript
  const date = new Date(post.publishedAt ?? post.createdAt).toLocaleDateString(
```

- [ ] **Step 7: 构建验证**

Run: `npx next build`
Expected: 构建成功

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma components/admin/PostForm.tsx app/api/posts/route.ts "app/api/posts/[id]/route.ts" components/blog/BlogCard.tsx components/home/RecentPosts.tsx "app/[locale]/blog/[slug]/page.tsx"
git commit -m "feat: add publishedAt field to posts for manual date editing"
```

---

### Task 3: 修复阅读时间计算

**Files:**
- Modify: `lib/posts.ts:27-32` — 重写 calculateReadTime
- Modify: `components/home/RecentPosts.tsx:61` — 使用翻译系统

**Interfaces:**
- Consumes: Tiptap JSON 格式的 content 字符串
- Produces: calculateReadTime 返回正确的阅读分钟数

- [ ] **Step 1: 重写 calculateReadTime 函数**

将 `lib/posts.ts` 中的 `calculateReadTime` 替换为：

```typescript
export function calculateReadTime(content: string): number {
  // 从 Tiptap JSON 递归提取纯文本，再按字数计算
  let text: string
  try {
    const json = JSON.parse(content)
    text = extractText(json)
  } catch {
    text = content.replace(/<[^>]+>/g, "")
  }
  const chars = text.length
  return Math.max(1, Math.ceil(chars / 300))
}

function extractText(node: Record<string, unknown>): string {
  let result = ""
  if (typeof node.text === "string") {
    result += node.text
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content as Record<string, unknown>[]) {
      result += extractText(child)
    }
  }
  return result
}
```

- [ ] **Step 2: 修复 RecentPosts 硬编码阅读时间文本**

在 `components/home/RecentPosts.tsx` 第61行，将：
```tsx
  <span>{p.readTime} {locale === "zh" ? "分钟阅读" : "min read"}</span>
```
改为：
```tsx
  <span>{t("minuteRead", { count: p.readTime })}</span>
```

注意：`t` 已定义为 `useTranslations("home")`，需要在 `messages/zh.json` 的 `home` 部分和 `messages/en.json` 的 `home` 部分各添加一个 `minuteRead` key。

**messages/zh.json** home 部分添加：
```json
"minuteRead": "{count}分钟阅读"
```

**messages/en.json** home 部分添加：
```json
"minuteRead": "{count} min read"
```

- [ ] **Step 3: 构建验证**

Run: `npx next build`
Expected: 构建成功

- [ ] **Step 4: Commit**

```bash
git add lib/posts.ts components/home/RecentPosts.tsx messages/zh.json messages/en.json
git commit -m "fix: correct readTime calculation for Tiptap JSON and use i18n in RecentPosts"
```

---

### Task 4: 更新博客副标题文案

**Files:**
- Modify: `messages/zh.json:20` — 中文描述
- Modify: `messages/en.json:20` — 英文描述

**Interfaces:**
- Consumes: next-intl 翻译系统
- Produces: 无下游代码依赖

- [ ] **Step 1: 更新中文翻译**

在 `messages/zh.json` 第20行，将：
```json
"description": "关于 Web 开发、设计和技术的思考。",
```
改为：
```json
"description": "关于开发、设计和技术的思考。",
```

- [ ] **Step 2: 更新英文翻译**

在 `messages/en.json` 第20行，将：
```json
"description": "Thoughts on web development, design, and technology.",
```
改为：
```json
"description": "Thoughts on development, design, and technology.",
```

- [ ] **Step 3: Commit**

```bash
git add messages/zh.json messages/en.json
git commit -m "fix: update blog description text"
```

---

### Task 5: 修复编辑器深色模式

**Files:**
- Modify: `components/admin/PostEditor.tsx:36` — 添加 dark:prose-invert

**Interfaces:**
- Consumes: Tailwind CSS prose 类 + dark 变体
- Produces: 无下游依赖

- [ ] **Step 1: 添加 dark:prose-invert**

在 `components/admin/PostEditor.tsx` 第36行，将：
```typescript
        class: "prose prose-neutral max-w-none min-h-[400px] p-4 focus:outline-none font-mono text-sm",
```
改为：
```typescript
        class: "prose prose-neutral dark:prose-invert max-w-none min-h-[400px] p-4 focus:outline-none font-mono text-sm",
```

- [ ] **Step 2: 构建验证**

Run: `npx next build`
Expected: 构建成功

- [ ] **Step 3: Commit**

```bash
git add components/admin/PostEditor.tsx
git commit -m "fix: add dark:prose-invert to PostEditor for dark mode visibility"
```
