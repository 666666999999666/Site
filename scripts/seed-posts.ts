import { prisma } from "../lib/db"
import type { PostStatus } from "../lib/generated/prisma/client"

const posts: { title: string; slug: string; content: string; excerpt: string; status: PostStatus; readTime: number; categoryId?: string; tags: string[] }[] = [
  {
    title: "从零开始搭建个人博客",
    slug: "build-personal-blog",
    content: JSON.stringify({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "为什么要自己写博客？" }] },
        { type: "paragraph", content: [{ type: "text", text: "用 WordPress、Hexo、Hugo 不是更方便吗？确实方便，但自己写一遍，你能学到的东西远比用现成工具多得多。从数据库设计到前端渲染，从认证系统到部署流程，每一步都是一次深入理解。" }] },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "技术选型" }] },
        { type: "paragraph", content: [{ type: "text", text: "我选择了 Next.js + PostgreSQL + Tailwind CSS 的组合。Next.js 提供了服务端渲染和 API 路由，PostgreSQL 是可靠的关系型数据库，Tailwind 让样式开发变得高效。" }] },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "最大的收获" }] },
        { type: "paragraph", content: [{ type: "text", text: "不是做出了一个博客，而是理解了 Web 应用是怎么从零到一跑起来的。这种理解，是抄模板换不来的。" }] },
      ],
    }),
    excerpt: "自己写一遍博客，你能学到的东西远比用现成工具多得多。",
    status: "PUBLISHED",
    readTime: 5,
    categoryId: "cat-blog-tech",
    tags: ["Next.js", "博客", "全栈"],
  },
  {
    title: "MCP 协议入门：让 AI 工具互相协作",
    slug: "mcp-protocol-intro",
    content: JSON.stringify({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "什么是 MCP？" }] },
        { type: "paragraph", content: [{ type: "text", text: "MCP（Model Context Protocol）是 Anthropic 提出的一种开放协议，让 AI 模型能够与外部工具和数据源进行标准化交互。简单说，它让不同的 AI 工具能\"说同一种语言\"。" }] },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "核心概念" }] },
        { type: "paragraph", content: [{ type: "text", text: "MCP 定义了三种基本原语：Tools（工具）、Resources（资源）、Prompts（提示）。Tools 让 AI 执行操作，Resources 让 AI 读取数据，Prompts 提供可复用的提示模板。" }] },
        { type: "paragraph", content: [{ type: "text", text: "最让我兴奋的是，MCP 让 AI 不再是孤岛。一个 AI 可以调用另一个 AI 的能力，也可以访问本地文件、数据库、API——一切通过统一协议。" }] },
      ],
    }),
    excerpt: "MCP 让不同的 AI 工具能说同一种语言，实现真正的协作。",
    status: "PUBLISHED",
    readTime: 6,
    categoryId: "cat-blog-tech",
    tags: ["MCP", "AI", "协议"],
  },
  {
    title: "读《重构》有感：好代码是改出来的",
    slug: "reading-refactoring",
    content: JSON.stringify({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "先让它跑起来，再让它跑得好" }] },
        { type: "paragraph", content: [{ type: "text", text: "Martin Fowler 的《重构》教会我一个道理：不要试图一开始就写出完美的代码。先让功能跑起来，然后通过小步重构，逐步改善代码结构。每次重构都是安全的，因为你有测试保护。" }] },
        { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "任何傻瓜都能写出计算机能理解的代码。优秀的程序员写出人能理解的代码。" }] }] },
        { type: "paragraph", content: [{ type: "text", text: "这句话我贴在显示器旁边，每次写代码前看一眼。代码是写给人看的，顺便让机器执行。" }] },
      ],
    }),
    excerpt: "不要试图一开始就写出完美的代码，先让功能跑起来，再逐步改善。",
    status: "PUBLISHED",
    readTime: 4,
    categoryId: "cat-blog-tech",
    tags: ["读书", "重构", "编程"],
  },
  {
    title: "Docker 部署踩坑记",
    slug: "docker-deployment-pitfalls",
    content: JSON.stringify({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "端口冲突：5432 的故事" }] },
        { type: "paragraph", content: [{ type: "text", text: "本地开发时，Docker 容器的 PostgreSQL 映射到 5432 端口，结果怎么都连不上。折腾半天发现，主机上已经装了一个 PostgreSQL 18，默默占着 5432。Docker 的端口映射静默失败，node pg 连的是主机的旧数据库，用户名密码当然不对。" }] },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "IPv6 的坑" }] },
        { type: "paragraph", content: [{ type: "text", text: "另一个坑：localhost 在 Windows 上可能解析到 IPv6 的 ::1，而 Docker 只监听 IPv4 的 127.0.0.1。Prisma 连 localhost 失败，换成 127.0.0.1 就好了。这种问题排查起来特别费时间，因为报错信息完全不提 IPv6。" }] },
        { type: "paragraph", content: [{ type: "text", text: "教训：本地开发用 127.0.0.1，别用 localhost。" }] },
      ],
    }),
    excerpt: "端口冲突、IPv6 解析、静默失败……Docker 本地开发的那些坑。",
    status: "PUBLISHED",
    readTime: 3,
    categoryId: "cat-blog-tech",
    tags: ["Docker", "踩坑", "PostgreSQL"],
  },
  {
    title: "日常随笔：夏天的代码和冰咖啡",
    slug: "summer-code-iced-coffee",
    content: JSON.stringify({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "七月的下午，空调房里敲代码，手边一杯冰美式。窗外蝉鸣不断，屏幕上 TypeScript 的类型错误也鸣个不停。" }] },
        { type: "paragraph", content: [{ type: "text", text: "有时候写代码就像种花，你播下种子（写第一版），浇水施肥（重构），等它慢慢长成你想要的样子。急不得，但每天都要照料。" }] },
        { type: "paragraph", content: [{ type: "text", text: "今天修了三个 bug，写了一个小功能，喝了两杯咖啡。算是充实的一天。" }] },
      ],
    }),
    excerpt: "七月的下午，空调房里敲代码，手边一杯冰美式。",
    status: "PUBLISHED",
    readTime: 2,
    tags: ["随笔", "日常"],
  },
]

async function main() {
  await prisma.post.deleteMany({ where: { slug: "test-1" } })
  for (const p of posts) {
    await prisma.post.create({ data: p })
  }
  console.log(`Inserted ${posts.length} posts`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
