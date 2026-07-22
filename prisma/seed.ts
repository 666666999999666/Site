import 'dotenv/config'
import { prisma } from '../lib/db'
import { hashPassword } from '../lib/auth/password'

async function main() {
  const password = process.env.SEED_PASSWORD
  if (!password) throw new Error('SEED_PASSWORD environment variable is required')
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
    where: { key: 'home_tagline' },
    update: {},
    create: { key: 'home_tagline', value: '记录思考、项目和对现代 Web 开发的探索。' },
  })
  await prisma.setting.upsert({
    where: { key: 'about_intro' },
    update: {},
    create: { key: 'about_intro', value: '你好，我是一名热爱构建 Web 应用的开发者。' },
  })
  await prisma.setting.upsert({
    where: { key: 'about_skills' },
    update: {},
    create: { key: 'about_skills', value: 'TypeScript,React,Next.js,Node.js,Docker,Git,Python,Rust' },
  })
  await prisma.setting.upsert({
    where: { key: 'about_github' },
    update: {},
    create: { key: 'about_github', value: 'https://github.com/666666999999666' },
  })
  await prisma.setting.upsert({
    where: { key: 'about_email' },
    update: {},
    create: { key: 'about_email', value: '' },
  })

  await prisma.project.upsert({
    where: { id: 'proj-qzsite' },
    update: {},
    create: {
      id: 'proj-qzsite',
      title: 'QZ Site',
      description: '个人博客与知识管理网站，基于 Next.js 16 + Prisma 7 + Tailwind CSS v4',
      tags: ['Next.js', 'TypeScript', 'Prisma', 'Tailwind'],
      sourceUrl: 'https://github.com/666666999999666/Site',
      sortOrder: 0,
    },
  })

  await prisma.category.upsert({
    where: { id: 'cat-blog-tech' },
    update: {},
    create: { id: 'cat-blog-tech', name: '技术笔记', type: 'BLOG', sortOrder: 0 },
  })
  await prisma.category.upsert({
    where: { id: 'cat-todo-study' },
    update: {},
    create: { id: 'cat-todo-study', name: '学习', type: 'TODO', sortOrder: 0 },
  })

  console.log('Seed completed')
}

main().catch(console.error).finally(() => prisma.$disconnect())
