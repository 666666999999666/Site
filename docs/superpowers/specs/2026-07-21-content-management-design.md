# 后台内容管理设计文档

## 概述

将首页标语、关于页内容、项目列表从硬编码改为数据库驱动，在后台提供增删改界面。

## 1. 数据库变更

### 1.1 新建 Project 模型

```prisma
model Project {
  id          String   @id @default(cuid())
  title       String
  description String?
  tags        String[]
  sourceUrl   String?
  demoUrl     String?
  sortOrder   Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([sortOrder])
}
```

### 1.2 扩展 Setting 表（key-value，无需改表结构）

新增 key：
- `home_tagline` — 首页标语描述（如"记录思考、项目和对现代 Web 开发的探索。"）
- `about_intro` — 关于页自我介绍（如"你好，我是一名热爱构建 Web 应用的开发者。"）
- `about_skills` — 技能标签，逗号分隔（如"TypeScript,React,Next.js,Node.js"）
- `about_github` — GitHub 链接
- `about_email` — 邮箱

现有保留的 key：`owner_name`, `tagline`

### 1.3 兼容性

- 使用 `prisma db push` 同步，只加表不删数据
- 所有现有数据保持不变

---

## 2. API 设计

### 2.1 项目 API

**`/api/projects` — 公开 GET，认证 POST**

| 方法 | 认证 | 功能 |
|------|------|------|
| GET | 公开 | 获取所有项目，按 sortOrder 排序 |
| POST | 需登录 | 创建项目，必填 title，可选 description/tags/sourceUrl/demoUrl |

**`/api/projects/[id]` — 认证 PATCH/DELETE**

| 方法 | 认证 | 功能 |
|------|------|------|
| PATCH | 需登录 | 部分更新项目字段 |
| DELETE | 需登录 | 删除项目 |

### 2.2 设置 API

现有 `/api/settings` GET/PUT 不变，前端表单扩展即可。

---

## 3. 后台页面

### 3.1 设置页扩展（`app/admin/settings/page.tsx`）

SettingsForm 新增字段：

| 字段 | Setting key | 类型 | 说明 |
|------|-------------|------|------|
| 首页标语 | `home_tagline` | Input | 首页 Hero 下方描述 |
| 关于页介绍 | `about_intro` | Textarea | 关于页自我介绍 |
| 技能标签 | `about_skills` | Input | 逗号分隔 |
| GitHub 链接 | `about_github` | Input | URL |
| 邮箱 | `about_email` | Input | email |

### 3.2 项目管理页（新建）

**`app/admin/projects/page.tsx`** — 项目列表

- 表格风格同文章管理：rounded-lg border-border/50
- 列：Title / Tags / Created / Actions(编辑/删除)
- "新建项目"按钮

**`app/admin/projects/new/page.tsx`** — 新建项目

- 表单：标题、描述、标签（逗号分隔）、源码链接、Demo链接
- 保存后跳转回列表

**`app/admin/projects/[id]/page.tsx`** — 编辑项目

- 同新建，预填数据
- 删除按钮（二次确认）

### 3.3 Admin 侧栏新增入口

在 AdminSidebar 中"文章管理"下方添加"项目管理"链接。

---

## 4. 前台页面改造

### 4.1 首页（`app/[locale]/page.tsx`）

- 读取 `home_tagline` 设置
- 传给 HeroSection 作为 description
- 从 Project 表读取最新项目（按 sortOrder，limit 4）

### 4.2 关于页（`app/[locale]/about/page.tsx`）

- 从 Setting 读取 `about_intro`、`about_skills`（逗号分隔转数组）、`about_github`、`about_email`
- 页面标题和区块标题仍用 i18n（"关于"/"About"、"我做什么"/"What I Do" 等）
- 内容部分用数据库值

### 4.3 项目页（`app/[locale]/projects/page.tsx`**

- 从 Project 表读取所有项目，按 sortOrder 排序
- 替换当前的硬编码数据

---

## 5. 文件清单

### 新建文件
```
app/api/projects/route.ts              # 项目 CRUD API
app/api/projects/[id]/route.ts         # 项目单项 API
app/admin/projects/page.tsx            # 项目列表管理
app/admin/projects/new/page.tsx        # 新建项目
app/admin/projects/[id]/page.tsx       # 编辑项目
components/admin/ProjectsTable.tsx     # 项目表格组件
components/admin/ProjectForm.tsx       # 项目表单组件
lib/projects.ts                        # 项目数据获取函数
```

### 修改文件
```
prisma/schema.prisma                   # 新增 Project 模型
prisma/seed.ts                         # 新增项目种子数据 + 新 Setting keys
components/admin/SettingsForm.tsx      # 扩展设置字段
components/admin/AdminSidebar.tsx      # 新增项目管理入口
components/home/HeroSection.tsx        # description 从数据库读取
app/[locale]/page.tsx                  # 传 tagline + 项目数据
app/[locale]/about/page.tsx            # 内容从数据库读取
app/[locale]/projects/page.tsx         # 数据从 Project 表读取
```

---

## 6. 数据流

```
后台设置页 → PUT /api/settings → Setting 表 → 前台首页/关于页读取
后台项目页 → POST/PATCH/DELETE /api/projects → Project 表 → 前台项目页/首页读取
```

前台页面使用 `force-dynamic` 或 `revalidate` 确保数据新鲜。
