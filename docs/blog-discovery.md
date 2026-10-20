# 博客检索、标签和系列约定

## 检索与卡片边界

- 标题和 Markdown 正文仍在 PostgreSQL 服务端搜索，分类与关键词组合生效。Prisma 的 `contains` 参数会转义 PostgreSQL LIKE 通配符，`%`、`_` 和反斜线按字面搜索。
- `lib/blog-card.ts` 的 `blogCardSelect` 只取生成卡片需要的数据。正文仅用于服务端摘要、内容形态和匹配上下文；任何传给客户端 `BlogCard` 的对象都必须先经过 `toBlogCard`，不能传完整 Post。
- 匹配片段最多 180 个 UTF-16 码元，首尾可增加省略号。标题与片段按字面匹配高亮，React 文本节点负责转义，不使用 `dangerouslySetInnerHTML`。只在 Markdown 链接或格式源码命中的结果会明确提示来源，不展示原始 HTML。
- 有筛选条件时显示结果数及当前条件；“清除搜索”保留分类，“重置全部筛选”只移除这两个条件。输入支持中文组合、快速连续操作与浏览器历史恢复。

## 标签兼容

`lib/tags.ts` 仅做 trim、拆分半角逗号/中文逗号/顿号及精确去重。英文大小写、Harness 与 Harness Engineering 等语义关系不自动合并。类型/函数括号和引号内的逗号保持原样，例如 `tuple<T, U>`、`function(a,b)`、`"Hello, World"`；未闭合语法也保守保留。普通未加引号名称中的字面逗号仍可能与列表分隔符有歧义，正式迁移前必须逐项查看报告；确认是字面名称时需明确保留规则，不得照单批量写入。

公开标签列表、文章标签、相关推荐和 RSS 共用规范化规则。旧组合标签 URL 继续返回其明确分隔出的标签的并集，并展示各个标签入口；不重写数据库或删除旧 URL。规范化标签 URL 也能查到尚未迁移的组合标签文章。

迁移计划只读，输入为包含 `id`、`slug`、`tags` 的 JSON 数组，不需要数据库连接：

```bash
node --import tsx scripts/plan-tag-normalization.ts posts.json
```

输出受影响文章、前后标签、旧/新 URL、重复合并数量和超出写入约束的检查项。没有 `--apply` 模式。语义别名、分类重组和正式内容迁移需在内容批次单独审核与授权。

## 系列和推荐

- 系列总览、文内目录及前后篇共用 `seriesPostOrder`，第一排序键始终是作者维护的 `seriesOrder`。日期只用于同序值的稳定后备排序，不能替代人工顺序。
- 系列总览显示一基篇章号和第一篇入口；存在但没有公开文章的系列显示空状态。
- 未加入系列的文章保留时间导航，明确标作“较早发布 / 较晚发布”，不假装是课程顺序。
- “相关文章”必须有同系列、同分类或共同规范标签之一，并展示关联类型。零关联候选不补齐数量；完全没有相关结果时，独立显示诚实命名的“最新文章”。候选及最终卡片查询都只允许公开文章，排除自身和重复项。
- MiniClaude 归属、系列基础要求、作者指定文章关联及语义标签别名属于内容编辑工作，本代码不会推断并写入。

## 验证

```bash
node --import tsx --test tests/blog-discovery.test.ts tests/blog-series.test.ts
PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium node node_modules/@playwright/test/cli.js test tests/browser/blog-discovery.spec.ts
```

浏览器回归使用本地 editor-harness 的合成文章，验证实际筛选/卡片组件、正文不进入 HTML/RSC、390/1440px 布局、IME、清空和历史恢复；不代表生产数据已迁移或生产页面已验收。
