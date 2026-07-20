import "dotenv/config"
import { PrismaClient } from '../lib/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  const posts = await prisma.post.findMany()
  const categories = await prisma.category.findMany()
  const todos = await prisma.todo.findMany()
  const users = await prisma.user.findMany()
  const settings = await prisma.setting.findMany()

  console.log('Posts:', posts.length)
  console.log('Categories:', categories.length)
  console.log('Todos:', todos.length)
  console.log('Users:', users.length)
  console.log('Settings:', settings.length)
  console.log('OK - database connection works, all tables created')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
