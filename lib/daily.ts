import { createHash } from "node:crypto"
import { prisma } from "@/lib/db"
import {
  addDateKeyDays,
  canonicalQuoteDateToKey,
  databaseDateToKey,
  dateKeyToDatabaseDate,
  getCanonicalQuoteDate,
  getMonthRange,
  getShanghaiDateKey,
  getShanghaiMonthKey,
} from "@/lib/daily-date"
import { ConfigurationError, ConflictError, NotFoundError, ValidationError } from "@/lib/errors"
import { Prisma } from "@/lib/generated/prisma/client"
import type {
  DailyQuoteCreateInput,
  DailyQuoteUpdateInput,
  DailyTaskInput,
} from "@/lib/daily-validation"

type DailyDatabase = typeof prisma | Prisma.TransactionClient

export interface DailyQuoteView {
  id: number
  quote: string
  category: string
  author: string | null
  source: string | null
  sourceDetail: string | null
}

export interface DailyTaskView {
  id: string | null
  slot: 1 | 2 | 3
  title: string
  completed: boolean
  completedAt: string | null
  sourceTodoId: string | null
}

export interface DailyDayView {
  date: string
  quote: DailyQuoteView
  tasks: DailyTaskView[]
  completedCount: number
  progress: number
}

export interface DailyStatsView {
  streak: number
  month: string
  recordedDays: number
  completedDays: number
  averageProgress: number
}

export interface DailyTodoOption {
  id: string
  title: string
  category: string | null
}

export interface DailyDashboardView {
  day: DailyDayView
  stats: DailyStatsView
  todoOptions: DailyTodoOption[]
}

export interface DailyMutationView {
  day: DailyDayView
  stats: DailyStatsView
}

interface PlanRecord {
  planDate: Date
  tasks: Array<{
    id: string
    slot: number
    title: string
    completedAt: Date | null
    sourceTodoId: string | null
  }>
}

const planInclude = {
  tasks: { orderBy: { slot: "asc" as const } },
} as const

function normalizeQuote(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim()
}

function quoteHash(value: string): string {
  return createHash("sha256").update(normalizeQuote(value), "utf8").digest("hex")
}

function progressFor(completedCount: number): number {
  return Math.round((completedCount / 3) * 100)
}

function quoteView(record: {
  id: number
  quote: string
  category: string
  author: string | null
  source: string | null
  sourceDetail: string | null
}): DailyQuoteView {
  return {
    id: record.id,
    quote: record.quote,
    category: record.category,
    author: record.author,
    source: record.source,
    sourceDetail: record.sourceDetail,
  }
}

async function getQuoteForDate(date: string, database: DailyDatabase): Promise<DailyQuoteView> {
  const quote = await database.dailyQuote.findFirst({
    where: { usedDate: getCanonicalQuoteDate(date), status: true },
  })
  if (!quote) {
    throw new ConfigurationError(`日期 ${date.slice(5)} 尚未配置启用的每日提醒语`)
  }
  return quoteView(quote)
}

function taskViews(tasks: PlanRecord["tasks"]): DailyTaskView[] {
  const bySlot = new Map(tasks.map((task) => [task.slot, task]))
  return ([1, 2, 3] as const).map((slot) => {
    const task = bySlot.get(slot)
    return {
      id: task?.id ?? null,
      slot,
      title: task?.title ?? "",
      completed: Boolean(task?.completedAt),
      completedAt: task?.completedAt?.toISOString() ?? null,
      sourceTodoId: task?.sourceTodoId ?? null,
    }
  })
}

async function getDailyDayWithDatabase(
  userId: string,
  date: string,
  database: DailyDatabase
): Promise<DailyDayView> {
  const plan = await database.dailyPlan.findUnique({
    where: { userId_planDate: { userId, planDate: dateKeyToDatabaseDate(date) } },
    include: planInclude,
  })

  const quote = plan
    ? {
        id: plan.quoteId ?? 0,
        quote: plan.quoteText,
        category: plan.quoteCategory,
        author: plan.quoteAuthor,
        source: plan.quoteSource,
        sourceDetail: plan.quoteSourceDetail,
      }
    : await getQuoteForDate(date, database)
  const tasks = taskViews(plan?.tasks ?? [])
  const completedCount = tasks.filter((task) => task.completed).length
  return { date, quote, tasks, completedCount, progress: progressFor(completedCount) }
}

export async function getDailyDay(userId: string, date: string): Promise<DailyDayView> {
  return getDailyDayWithDatabase(userId, date, prisma)
}

function buildStats(plans: PlanRecord[], today: string, month: string): DailyStatsView {
  const completeDates = new Set(
    plans
      .filter((plan) => plan.tasks.length === 3 && plan.tasks.every((task) => task.completedAt))
      .map((plan) => databaseDateToKey(plan.planDate))
  )
  let cursor = completeDates.has(today) ? today : addDateKeyDays(today, -1)
  let streak = 0
  while (completeDates.has(cursor)) {
    streak += 1
    cursor = addDateKeyDays(cursor, -1)
  }

  const monthPlans = plans.filter((plan) => databaseDateToKey(plan.planDate).startsWith(month))
  const recordedPlans = monthPlans.filter((plan) => plan.tasks.length > 0)
  const completedDays = recordedPlans.filter(
    (plan) => plan.tasks.length === 3 && plan.tasks.every((task) => task.completedAt)
  ).length
  const completedTasks = recordedPlans.reduce(
    (total, plan) => total + plan.tasks.filter((task) => task.completedAt).length,
    0
  )
  const averageProgress = recordedPlans.length
    ? Math.round((completedTasks / (recordedPlans.length * 3)) * 100)
    : 0

  return {
    streak,
    month,
    recordedDays: recordedPlans.length,
    completedDays,
    averageProgress,
  }
}

async function getPlansForStats(userId: string, today: string): Promise<PlanRecord[]> {
  return prisma.dailyPlan.findMany({
    where: { userId, planDate: { lte: dateKeyToDatabaseDate(today) } },
    select: {
      planDate: true,
      tasks: {
        select: {
          id: true,
          slot: true,
          title: true,
          completedAt: true,
          sourceTodoId: true,
        },
      },
    },
    orderBy: { planDate: "desc" },
  })
}

export async function getDailyStats(userId: string, now = new Date()): Promise<DailyStatsView> {
  const today = getShanghaiDateKey(now)
  const plans = await getPlansForStats(userId, today)
  return buildStats(plans, today, getShanghaiMonthKey(now))
}

export async function getDailyDashboard(userId: string, now = new Date()): Promise<DailyDashboardView> {
  const today = getShanghaiDateKey(now)
  const [day, todoOptions, stats] = await Promise.all([
    getDailyDay(userId, today),
    prisma.todo.findMany({
      where: { status: "TODO" },
      select: { id: true, title: true, category: { select: { name: true } } },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      take: 100,
    }),
    getDailyStats(userId, now),
  ])
  return {
    day,
    stats,
    todoOptions: todoOptions.map((todo) => ({
      id: todo.id,
      title: todo.title,
      category: todo.category?.name ?? null,
    })),
  }
}

export async function getDailyHistory(userId: string, month: string, now = new Date()) {
  const today = getShanghaiDateKey(now)
  const { start, end } = getMonthRange(month)
  const [history, plans] = await Promise.all([
    prisma.dailyPlan.findMany({
      where: { userId, planDate: { gte: start, lt: end } },
      include: planInclude,
      orderBy: { planDate: "desc" },
    }),
    getPlansForStats(userId, today),
  ])
  return {
    month,
    stats: buildStats(plans, today, month),
    days: history.map((plan) => {
      const tasks = taskViews(plan.tasks)
      const completedCount = tasks.filter((task) => task.completed).length
      return {
        date: databaseDateToKey(plan.planDate),
        quote: {
          id: plan.quoteId ?? 0,
          quote: plan.quoteText,
          category: plan.quoteCategory,
          author: plan.quoteAuthor,
          source: plan.quoteSource,
          sourceDetail: plan.quoteSourceDetail,
        },
        tasks,
        completedCount,
        progress: progressFor(completedCount),
      } satisfies DailyDayView
    }),
  }
}

function assertToday(date: string, now: Date) {
  if (date !== getShanghaiDateKey(now)) {
    throw new ValidationError("只能修改今天的三件事")
  }
}

export async function saveDailyTask(
  userId: string,
  slot: 1 | 2 | 3,
  input: DailyTaskInput,
  now = new Date()
): Promise<DailyDayView> {
  assertToday(input.date, now)
  try {
    return await prisma.$transaction(async (transaction) => {
      const planDate = dateKeyToDatabaseDate(input.date)
      const existingPlan = await transaction.dailyPlan.findUnique({
        where: { userId_planDate: { userId, planDate } },
        include: planInclude,
      })

      if (!input.title) {
        if (existingPlan) {
          await transaction.dailyTask.deleteMany({ where: { planId: existingPlan.id, slot } })
          const remaining = await transaction.dailyTask.count({ where: { planId: existingPlan.id } })
          if (remaining === 0) await transaction.dailyPlan.delete({ where: { id: existingPlan.id } })
        }
        return getDailyDayWithDatabase(userId, input.date, transaction)
      }

      let sourceTodoId = input.sourceTodoId ?? null
      if (sourceTodoId) {
        const todo = await transaction.todo.findUnique({
          where: { id: sourceTodoId },
          select: { title: true, status: true },
        })
        if (!todo || todo.status !== "TODO") {
          throw new ValidationError("所选 Todo 已不存在或已经完成")
        }
        if (todo.title.trim() !== input.title) sourceTodoId = null
      }

      const quote = await getQuoteForDate(input.date, transaction)
      const plan = await transaction.dailyPlan.upsert({
        where: { userId_planDate: { userId, planDate } },
        update: {},
        create: {
          userId,
          planDate,
          quoteId: quote.id,
          quoteText: quote.quote,
          quoteCategory: quote.category,
          quoteAuthor: quote.author,
          quoteSource: quote.source,
          quoteSourceDetail: quote.sourceDetail,
        },
      })
      const existing = await transaction.dailyTask.findUnique({
        where: { planId_slot: { planId: plan.id, slot } },
      })
      const completedAt = input.completed ? (existing?.completedAt ?? now) : null
      await transaction.dailyTask.upsert({
        where: { planId_slot: { planId: plan.id, slot } },
        update: { title: input.title, sourceTodoId, completedAt },
        create: { planId: plan.id, slot, title: input.title, sourceTodoId, completedAt },
      })
      return getDailyDayWithDatabase(userId, input.date, transaction)
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictError("同一个 Todo 不能同时放入今天的两个位置")
    }
    throw error
  }
}

export async function deleteDailyTask(
  userId: string,
  slot: 1 | 2 | 3,
  date: string,
  now = new Date()
): Promise<DailyDayView> {
  return saveDailyTask(userId, slot, { date, title: "", completed: false }, now)
}

export async function listDailyQuotes(options: {
  page: number
  pageSize: number
  status: "all" | "active" | "inactive"
  query: string
}) {
  const where: Prisma.DailyQuoteWhereInput = {
    ...(options.status === "active" ? { status: true } : {}),
    ...(options.status === "inactive" ? { status: false } : {}),
    ...(options.query ? {
      OR: [
        { quote: { contains: options.query, mode: "insensitive" } },
        { category: { contains: options.query, mode: "insensitive" } },
        { author: { contains: options.query, mode: "insensitive" } },
        { source: { contains: options.query, mode: "insensitive" } },
      ],
    } : {}),
  }
  const [items, total, categoryRows, replacements] = await Promise.all([
    prisma.dailyQuote.findMany({
      where,
      orderBy: [{ usedDate: { sort: "asc", nulls: "last" } }, { id: "asc" }],
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
    }),
    prisma.dailyQuote.count({ where }),
    prisma.dailyQuote.groupBy({ by: ["category"], orderBy: { category: "asc" } }),
    prisma.dailyQuote.findMany({
      where: { status: true, usedDate: null },
      select: { id: true, quote: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ])
  return {
    items: items.map((item) => ({
      ...quoteView(item),
      status: item.status,
      assignedDate: canonicalQuoteDateToKey(item.usedDate)?.slice(5) ?? null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
    page: options.page,
    pageSize: options.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / options.pageSize)),
    categories: categoryRows.map((row) => row.category),
    replacements,
  }
}

export async function createDailyQuote(input: DailyQuoteCreateInput) {
  try {
    const quote = await prisma.dailyQuote.create({
      data: {
        quote: input.quote,
        category: input.category,
        author: input.author ?? null,
        source: input.source ?? null,
        sourceDetail: input.sourceDetail ?? null,
        status: input.status ?? true,
        normalizedHash: quoteHash(input.quote),
      },
    })
    return { ...quoteView(quote), status: quote.status, assignedDate: null }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictError("这条提醒语已经存在")
    }
    throw error
  }
}

async function getReplacement(
  transaction: Prisma.TransactionClient,
  replacementQuoteId: number | null | undefined,
  currentQuoteId: number
) {
  if (!replacementQuoteId || replacementQuoteId === currentQuoteId) {
    throw new ConflictError("请先创建一条未分配的新提醒语，并选择它作为替代")
  }
  const replacement = await transaction.dailyQuote.findUnique({ where: { id: replacementQuoteId } })
  if (!replacement || !replacement.status || replacement.usedDate) {
    throw new ConflictError("替代提醒语必须处于启用且未分配状态")
  }
  return replacement
}

export async function updateDailyQuote(id: number, input: DailyQuoteUpdateInput) {
  const { replacementQuoteId, ...fields } = input
  try {
    return await prisma.$transaction(async (transaction) => {
      const current = await transaction.dailyQuote.findUnique({ where: { id } })
      if (!current) throw new NotFoundError("提醒语不存在")

      if (fields.status === false && current.usedDate) {
        await getReplacement(transaction, replacementQuoteId, id)
        await transaction.dailyQuote.update({ where: { id }, data: { usedDate: null } })
        await transaction.dailyQuote.update({
          where: { id: replacementQuoteId! },
          data: { usedDate: current.usedDate },
        })
      }

      const updated = await transaction.dailyQuote.update({
        where: { id },
        data: {
          ...(fields.quote !== undefined ? {
            quote: fields.quote,
            normalizedHash: quoteHash(fields.quote),
          } : {}),
          ...(fields.category !== undefined ? { category: fields.category } : {}),
          ...(fields.author !== undefined ? { author: fields.author } : {}),
          ...(fields.source !== undefined ? { source: fields.source } : {}),
          ...(fields.sourceDetail !== undefined ? { sourceDetail: fields.sourceDetail } : {}),
          ...(fields.status !== undefined ? { status: fields.status } : {}),
        },
      })
      return {
        ...quoteView(updated),
        status: updated.status,
        assignedDate: canonicalQuoteDateToKey(updated.usedDate)?.slice(5) ?? null,
      }
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictError("提醒语内容重复或日期分配发生冲突")
    }
    throw error
  }
}

export async function deleteDailyQuote(id: number, replacementQuoteId?: number | null) {
  await prisma.$transaction(async (transaction) => {
    const current = await transaction.dailyQuote.findUnique({ where: { id } })
    if (!current) throw new NotFoundError("提醒语不存在")
    if (current.usedDate) {
      await getReplacement(transaction, replacementQuoteId, id)
      await transaction.dailyQuote.update({ where: { id }, data: { usedDate: null } })
      await transaction.dailyQuote.update({
        where: { id: replacementQuoteId! },
        data: { usedDate: current.usedDate },
      })
    }
    await transaction.dailyQuote.delete({ where: { id } })
  })
  return { ok: true }
}
