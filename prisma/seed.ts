import 'dotenv/config'
import { prisma } from '../lib/db'
import { hashPassword } from '../lib/auth/password'

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

  console.log('Seed 完成')
  console.log('默认账号: admin /', password)
}

main().catch(console.error).finally(() => prisma.$disconnect())
