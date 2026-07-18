# 项目架构约束

> 本文档是所有实现工作的硬约束。任何与此文档冲突的代码都不允许提交。
> 优先级：架构约束 > 实现计划中的代码示例。

---

## 一、核心原则

### 1. 简单优先（Keep It Simple）

- 不过度设计
- 不提前引入未来可能需要的复杂抽象
- 不为了"高级架构"增加无意义层级
- 100 行简单代码 > 500 行通用框架
- 简单模块 > 复杂框架
- 清晰代码 > 巧妙代码
- 显式依赖 > 隐式魔法

### 2. 高内聚低耦合

- 一个模块只负责一个明确职责
- 模块之间通过接口通信
- 禁止跨模块直接访问内部实现

### 3. 单一依赖方向

```
API 路由（接口层）
  ↓
Service（业务逻辑）
  ↓
Repository（数据访问）
  ↓
Database
```

**禁止**：Repository 调用 Service、Service 依赖 API 路由、循环依赖。

### 4. 接口优先

新增功能前先设计：
1. 模块职责
2. 输入输出
3. 数据结构
4. 接口

再实现代码。不要边写边设计。

---

## 二、目录结构（Next.js 项目适配版）

保留 Next.js App Router 的 `app/` 路由约定，业务代码按 domain 分模块：

```
个人网站v3/
├── app/                          # Next.js 路由层（接口层，薄）
│   ├── page.tsx                  首页
│   ├── blog/                     公开博客页面
│   ├── admin/                    后台页面
│   └── api/                      API 路由（薄，只调度）
│
├── components/                   React 组件（纯 UI）
│   ├── ui/                       shadcn/ui 基础组件
│   ├── layout/                   布局组件
│   ├── home/                     首页组件
│   ├── blog/                     博客展示组件
│   ├── auth/                     登录相关组件
│   └── admin/                    后台组件
│
├── lib/                          业务代码（核心层）
│   ├── db.ts                     Prisma 单例（基础设施）
│   ├── config.ts                 环境变量解析与校验
│   ├── logger.ts                 简单日志
│   ├── errors.ts                 通用错误类型
│   ├── api/
│   │   └── handler.ts            API 错误处理工具
│   ├── auth/
│   │   ├── types.ts              接口/类型定义
│   │   ├── password.ts           密码 hash/verify
│   │   ├── session.ts            会话管理
│   │   ├── repository.ts         用户数据访问
│   │   └── service.ts            登录/退出/改密业务
│   ├── posts/
│   │   ├── types.ts              接口/类型
│   │   ├── repository.ts         Prisma 数据访问
│   │   ├── service.ts            业务逻辑
│   │   └── utils.ts              slug/阅读时间等纯函数
│   ├── todos/
│   │   ├── types.ts
│   │   ├── repository.ts
│   │   └── service.ts
│   ├── categories/
│   │   ├── types.ts
│   │   ├── repository.ts
│   │   └── service.ts
│   ├── settings/
│   │   ├── repository.ts
│   │   └── service.ts
│   └── uploads/
│       └── service.ts            图片上传逻辑
│
├── prisma/
│   ├── schema.prisma             数据模型
│   └── seed.ts                  种子数据
│
├── middleware.ts                路由保护
├── Dockerfile
├── docker-compose.yml
└── docs/
```

### 分层规则

| 层 | 职责 | 禁止 |
|----|------|------|
| `app/api/*` | 解析请求、调度 service、返回响应 | 写业务逻辑、直接调 Prisma |
| `lib/*/service.ts` | 业务逻辑、规则校验 | 直接调 Prisma（必须走 repository） |
| `lib/*/repository.ts` | 数据访问，封装 Prisma 调用 | 写业务规则 |
| `lib/*/types.ts` | 接口、DTO、错误类型 | 写实现 |
| `components/*` | 纯 UI，不耦合业务 | 直接调 Prisma、写业务规则 |

---

## 三、代码复杂度控制

### 文件行数

- 单文件 **≤ 300 行**为佳
- **> 500 行**必须拆分
- 组件文件 > 200 行考虑拆子组件

### 单一职责

一个文件/类/函数只做一件事。

**错误示例**（禁止）：

```
UserManager 负责：
- 用户数据库 CRUD
- 登录验证
- 邮件发送
- 权限判断
- 日志
- API 响应
```

**正确做法**：

```
UserRepository    → 数据访问
AuthService       → 登录验证
EmailService      → 邮件
PermissionService → 权限
Logger            → 日志
```

---

## 四、错误处理

### 禁止

```typescript
try {
  // xxx
} catch (e) {
  // 吞掉错误
}
```

### 要求

错误必须：
- 分类（明确错误类型）
- 明确原因
- 保留上下文

### 实现

在 `lib/errors.ts` 定义基础错误类：

```typescript
export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public context?: Record<string, unknown>
  ) {
    super(message)
    this.name = this.constructor.name
  }
}

export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "VALIDATION_ERROR", 400, context)
  }
}

export class AuthError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "AUTH_ERROR", 401, context)
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "NOT_FOUND", 404, context)
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "DATABASE_ERROR", 500, context)
  }
}
```

API 路由统一用 `lib/api/handler.ts` 处理：

```typescript
import { AppError } from "@/lib/errors"

export function handleApiError(e: unknown) {
  if (e instanceof AppError) {
    return NextResponse.json(
      { error: e.message, code: e.code },
      { status: e.statusCode }
    )
  }
  console.error("[UnexpectedError]", e)
  return NextResponse.json(
    { error: "服务器内部错误", code: "INTERNAL_ERROR" },
    { status: 500 }
  )
}
```

---

## 五、日志

关键流程必须有日志：输入、状态变化、错误原因、执行时间。

`lib/logger.ts` 简单实现：

```typescript
type Level = "info" | "warn" | "error"

function log(level: Level, msg: string, context?: Record<string, unknown>) {
  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${msg}`
  if (context) console[level === "error" ? "error" : "log"](line, context)
  else console[level === "error" ? "error" : "log"](line)
}

export const logger = {
  info: (msg: string, ctx?: Record<string, unknown>) => log("info", msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => log("warn", msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => log("error", msg, ctx),
}
```

**禁止**：大量无意义的 `console.log`。

---

## 六、配置管理

**禁止**硬编码：

```typescript
// 错
const API_KEY = "sk-xxx"
const DATABASE_URL = "postgresql://..."
```

**统一**走 `lib/config.ts`：

```typescript
// lib/config.ts
function requireEnv(key: string): string {
  const v = process.env[key]
  if (!v) throw new Error(`环境变量 ${key} 未设置`)
  return v
}

export const config = {
  databaseUrl: process.env.DATABASE_URL!,
  sessionSecret: requireEnv("SESSION_SECRET"),
  githubUrl: process.env.NEXT_PUBLIC_GITHUB_URL || "",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  nodeEnv: process.env.NODE_ENV || "development",
  isProd: process.env.NODE_ENV === "production",
}
```

---

## 七、模块开发流程

每开发一个模块必须先输出：

### 1. 模块职责
- 为什么存在
- 解决什么问题
- 不负责什么

### 2. 设计结构
```
模块A → 模块B → 模块C
```

### 3. 数据流
```
输入 → 处理 → 输出
```

### 4. 核心接口
- 函数签名
- 参数类型
- 返回值类型

### 5. 再编码

---

## 八、修改已有代码规则

修改前必须分析：
1. 当前代码结构
2. 当前依赖关系
3. 潜在影响范围

**禁止**看到 bug 直接打补丁。
**优先**找到根因。

发现架构问题：先提出重构方案，再改。

---

## 九、可测试性

核心模块必须可以独立测试。

**禁止**：Service 直接调用数据库（必须通过 Repository 接口）。

**应该**：
```
Service
  ↓
Repository Interface
  ↓
（测试时）Mock Repository
```

实践上：
- `repository.ts` 导出函数接口（TypeScript type）
- `service.ts` 通过参数接收 repository（依赖注入）
- 测试时传 mock

简化版（个人项目可接受）：
- `repository.ts` 导出具体函数
- `service.ts` 直接 import repository 函数
- 测试时用 `vi.mock` 替换

---

## 十、防屎山代码检查清单

每次完成任务后检查：

### 架构
- [ ] 模块职责是否清晰
- [ ] 是否存在循环依赖
- [ ] 是否存在巨型类/巨型文件（> 500 行）
- [ ] 是否存在重复代码

### 可维护性
- [ ] 新人是否能快速理解
- [ ] 是否容易定位 bug
- [ ] 是否容易增加新功能

### 代码质量
- [ ] 是否存在隐藏状态
- [ ] 是否存在硬编码
- [ ] 是否存在过度抽象
- [ ] 是否存在临时方案

发现问题：**优先重构**，而不是继续堆代码。

---

## 十一、最终目标

生成的项目应该满足：

1. 小项目保持简单
2. 模块边界清晰
3. 修改影响范围可控
4. Bug 容易定位
5. 新功能容易扩展
6. 未来可以逐步演进，而不是推倒重写
