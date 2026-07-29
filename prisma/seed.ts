import 'dotenv/config'
import { prisma } from '../lib/db'
import { hashPassword } from '../lib/auth/password'

async function main() {
  const existingAdmin = await prisma.user.findUnique({ where: { username: 'admin' } })
  if (!existingAdmin) {
    const password = process.env.SEED_PASSWORD
    if (!password || password.length < 15) {
      throw new Error('SEED_PASSWORD must contain at least 15 characters when creating admin')
    }
    const hash = await hashPassword(password)
    await prisma.user.create({
      data: { username: 'admin', passwordHash: hash },
    })
  }

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
    where: { key: 'home_role' },
    update: {},
    create: { key: 'home_role', value: '开发者 / 持续学习者' },
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
    where: { key: 'email' },
    update: {},
    create: { key: 'email', value: '' },
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

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
