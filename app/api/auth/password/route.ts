import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth/session"
import { findUserByUsername } from "@/lib/auth/repository"
import { verifyPassword, hashPassword } from "@/lib/auth/password"
import { handleApiError } from "@/lib/api/handler"
import { AuthError, ValidationError } from "@/lib/errors"
import { prisma } from "@/lib/db"

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session.isLoggedIn) throw new AuthError("未登录")

    const { currentPassword, newPassword } = await req.json()
    if (!currentPassword || !newPassword) throw new ValidationError("参数缺失")
    if (newPassword.length < 6) throw new ValidationError("新密码至少 6 位")

    const user = await findUserByUsername(session.username!)
    if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new AuthError("当前密码错误")
    }

    const hash = await hashPassword(newPassword)
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hash },
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return handleApiError(e)
  }
}
