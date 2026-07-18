# 个人数字花园（个人网站兼博客系统）设计文档

**日期**：2026-07-19
**状态**：设计已确认，待实现计划

---

## 一、项目定位

这个个人网站不应该是复杂的后台管理系统，而是定位为：

> **一个以博客为核心，结合私人知识管理和 Todo 管理的个人数字花园（Digital Garden）。**

### 服务场景

**公开展示**
- 展示个人信息
- 展示技术博客
- 展示 GitHub 等个人链接
- 让访客获得简洁、舒适的阅读体验

**私人使用**
- 在线写博客
- 管理学习笔记
- 管理个人 Todo
- 根据分类和关键词快速复习历史内容

### 整体目标

- 简单
- 美观
- 长期可维护
- 实际高频使用

避免为了展示技术而加入大量低频功能。

### 核心原则

> 不要做一个复杂系统，而要做一个自己每天愿意打开使用的网站。

---

## 二、整体视觉设计

### 设计方向

**极简 + 温暖文艺 + 阅读友好**

参考：Vercel、Linear、Bear Blog、Apple 产品页面

### 核心设计原则

1. **大量留白**：减少复杂组件，让内容成为主体
   - 避免：大量动画、花哨背景、复杂卡片堆叠、过度装饰

2. **字体设计**
   - 标题：Noto Serif SC（思源宋体）— 文学感
   - 正文：Noto Sans SC（思源黑体）— 易阅读

3. **配色（暖色调）**
   - 主背景：`#FAF7F2`（米白，像旧书纸）
   - 卡片背景：`#FFFFFF`
   - 主文字：`#3D3530`（深棕，比纯黑柔和）
   - 次要文字：`#8A7F75`（灰棕）
   - 强调色：`#C97B3D`（暖橙，按钮/链接/标签）
   - 分割线：`#E8E0D5`
   - 整体感觉：纸质笔记 + 个人书房

### 视觉细节

- 圆角 12px（柔和但不卡通）
- 阴影极淡：`0 1px 3px rgba(0,0,0,0.04)`
- 阅读区最大宽度 720px
- 博客正文：字号 17px、行高 1.8
- 动作用 Motion：全部柔和淡入（200-300ms）
- 不做明暗切换（文艺风为单一暖色主题）

---

## 三、页面结构设计

### 1. 首页（流式单页）

**不采用**传统简历式模板（姓名+介绍+技能+项目+联系方式堆叠）。

**采用**流式结构：

```
头像
↓
姓名
↓
一句简单介绍
↓
最近文章（3-5 篇预览）
↓
更多文章入口
↓
GitHub / 联系方式
```

**首页核心作用**：让访客快速知道你是谁、你写什么、如何继续阅读。

### 2. 公开博客页面

```
/blog（文章列表，按时间倒序）
  ↓
/blog/[slug]（文章详情）
```

**文章默认按发布时间倒序排列**。
**不公开展示复杂分类**。

原因：个人博客长期运行后，分类容易越来越混乱。公开阅读体验应该保持简单。

### 3. 文章展示字段

文章详情页包含：
- 标题
- 发布时间
- 阅读时间（自动计算）
- 正文
- 标签（可选）

示例：

```
Agent Native 开发实践

2026-07-18 · 8 min read

正文内容……
```

---

## 四、私人后台设计

### 入口设计

- **右下角隐藏一个小猫/小狗按钮**（Lucide `Cat` 图标）
- 默认半透明，悬停时变清晰并轻微浮动
- 点击 → 密码验证 → 个人后台

普通访客不会注意，但自己使用方便。

### 后台模块（只保留三个核心模块）

```
Blog
├─ 创建文章
├─ 编辑文章
├─ 保存草稿
├─ 发布文章
└─ 删除文章

Todo
├─ 自定义分区
├─ 添加任务
├─ 完成任务
└─ 删除任务

Settings
├─ 分区管理（Blog 分区 + Todo 分区）
├─ 个人信息设置
└─ 密码修改
```

**搜索功能**整合在 Blog 模块内（不独立成模块），服务于本人快速找历史学习内容。

### 博客工作流

```
Draft（草稿）
  ↓
Preview（预览）
  ↓
Publish（发布）
```

### Todo 管理

不做复杂项目管理工具。采用简单分区设计：

```
学习
  □ Agent
  □ MCP
  □ Next.js

网站
  □ SEO
  □ 新功能

生活
  □ ...
```

**Todo 状态**：仅 待办 / 完成 两态（不做"进行中"）

### 私人知识搜索

- **位置**：仅出现在后台 Blog 管理列表页顶部（公开页面不提供搜索）
- 搜索只服务本人
- 目标：快速找到过去学习内容
- 输入关键词（如 "MCP"）-> 找到相关博客和学习笔记
- 实现：使用 PostgreSQL 数据库全文搜索即可，不需要复杂 AI 搜索

---

## 五、编辑器设计

### 选型

**Tiptap 编辑器**（不实现完整 Notion）

### 原因

Notion 功能复杂（Block 系统、数据库、Slash Command、多种嵌套结构），对个人博客没有必要。

### 支持的格式

- 标题 H1 / H2 / H3
- 粗体、斜体
- 引用
- 图片（上传到服务器本地）
- 代码块（带语法高亮）
- 链接
- 分割线

满足：技术博客、学习笔记、个人随笔全部需求。

### 工具栏

- 顶部固定，写长文不消失
- 所见即所得（Notion 风格交互）

---

## 六、技术架构

### 技术栈

**前端**
- Next.js 16
- React 19
- TypeScript
- App Router

**UI**
- Tailwind CSS v4
- shadcn/ui
- Motion
- Lucide React

**后端**（使用 Next.js 全栈能力）
- API Route
- Server Action
- 登录验证（bcrypt + iron-session）

**数据库**
- PostgreSQL
- Prisma ORM

### 数据模型

```prisma
// 博客文章
model Post {
  id          String   @id @default(cuid())
  title       String
  content     String   // Tiptap JSON
  excerpt     String?  // 摘要
  slug        String   @unique
  categoryId  String?
  category    Category? @relation(fields: [categoryId], references: [id])
  tags        String[] // 标签
  status      PostStatus // DRAFT / PUBLISHED
  readTime    Int      // 阅读时间（分钟，自动计算）
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

// 分区（Blog 和 Todo 共用，用 type 区分）
model Category {
  id          String   @id @default(cuid())
  name        String
  type        CategoryType // BLOG / TODO
  description String?
  color       String?  // 分区颜色
  sortOrder   Int      @default(0)
  posts       Post[]
  todos       Todo[]
  createdAt   DateTime @default(now())
}

// Todo 任务
model Todo {
  id          String   @id @default(cuid())
  title       String
  description String?
  categoryId  String?
  category    Category? @relation(fields: [categoryId], references: [id])
  status      TodoStatus // TODO / DONE
  priority    Int      @default(0)
  dueDate     DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

// 用户与设置
model User {
  id           String  @id @default(cuid())
  username     String  @unique
  passwordHash String
  createdAt    DateTime @default(now())
}

model Setting {
  id    String @id @default(cuid())
  key   String @unique
  value String
}
```

---

## 七、部署方案

### 部署流程

```
GitHub
  ↓
GitHub Actions（自动构建 + 推镜像）
  ↓
Docker Image（推送到 GHCR）
  ↓
SSH 到腾讯云服务器
  ↓
Docker Compose 拉起容器
```

### 服务器运行架构

```
Nginx（反向代理 + HTTPS）
  ↓
Next.js（应用容器）
  ↓
PostgreSQL（数据库容器）
```

### docker-compose.yml 关键设计

```yaml
services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/conf.d:/etc/nginx/conf.d
      - ./nginx/certs:/etc/nginx/certs
    depends_on:
      - web
    restart: always

  web:
    image: ghcr.io/<owner>/blog:latest
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/blog
      - SESSION_SECRET=${SESSION_SECRET}
    depends_on:
      - db
    restart: always

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=blog
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - ./data/postgres:/var/lib/postgresql/data  # 关键：数据持久化
    restart: always
```

### 数据安全

**数据库不放容器内部**，使用 Docker Volume：
- `/data/postgres` — 数据库文件
- `/data/uploads` — 上传的图片

保证：
- 容器删除，数据仍存在
- 更新版本，不影响博客
- 图片不会丢失

### 后续可选增强

自动备份：
```
服务器 → 定时任务 → 腾讯云 COS
```

---

## 八、关键流程

### 访客流程

1. 进首页 → 看到头像、姓名、简介、最近文章
2. 点"全部文章" → 进入 /blog 文章列表（按时间倒序）
3. 点开一篇文章 → 阅读详情
4. 看不到 Todo、后台、分区、搜索

### 本人流程

1. 进首页 → 点右下角小猫按钮
2. 弹出密码框 → 输密码
3. 进入后台 /admin
4. 选择 Blog / Todo / Settings
5. 写博客、管 Todo、改设置

### 密码保护

- 单一密码登录所有私密区域
- 密码用 bcrypt 加密存数据库
- 用 iron-session 存会话（24 小时有效）
- 中间件保护 `/admin/*` 路由，未登录跳登录页
- 连续输错 5 次锁 5 分钟（防爆破）

---

## 九、后续待用户提供的信息

以下信息在实现阶段填入，不影响架构设计：

- 真实姓名
- 一句话标语（可留空）
- 头像图片
- 技能标签列表
- 其他社交链接（邮箱、微信等）
- 初始登录密码
- GitHub 链接：https://github.com/666666999999666
- 腾讯云服务器 IP
- 域名

---

## 十、最终目标

最终网站应该像一个**个人空间**：

**公开部分**：展示自己的技术积累和成长记录。
**私人部分**：管理自己的学习、计划和知识。

**技术上**：现代 Web 技术、真实部署、有数据库、有身份认证、有 CI/CD。

**产品体验**：简单、大方、美观、长期可用。
