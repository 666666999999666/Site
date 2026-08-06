import { NextRequest, NextResponse } from "next/server"
import { findUserByUsername } from "@/lib/auth/repository"
import { verifyPassword, hashPassword } from "@/lib/auth/password"
import { handleApiError } from "@/lib/api/handler"
import { AuthError } from "@/lib/errors"
import { prisma } from "@/lib/db"
import { ensureAuthenticated } from "@/lib/api/auth"
import { readJsonObject, validatePasswordChange } from "@/lib/validation"

export async function POST(req: NextRequest) {
  try {
    const session = await ensureAuthenticated()

    const { currentPassword, newPassword } = validatePasswordChange(
      await readJsonObject(req)
    )

    const user = await findUserByUsername(session.username!)
    if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new AuthError("当前密码错误")
    }

    const hash = await hashPassword(newPassword)
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hash,
        passwordVersion: { increment: 1 },
      },
    })
    session.destroy()

    return NextResponse.json({ ok: true, loggedOut: true })
  } catch (e) {
    return handleApiError(e)
  }
}
