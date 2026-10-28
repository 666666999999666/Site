import { prisma } from "@/lib/db"
import {
  PUBLIC_SETTING_KEYS,
  type PublicSettingKey,
} from "@/lib/validation"

export type PublicSettings = Record<PublicSettingKey, string>

export const DEFAULT_PUBLIC_SETTINGS: PublicSettings = {
  owner_name: "QZ Site",
  email: "",
  home_tagline: "记录 Agent 应用与 Python 后端开发的学习和实践。",
  home_role: "Agent 应用 / Python 后端开发",
  about_intro: "计算机相关专业硕士背景，关注 Agent 应用与 Python 后端开发。",
  about_whatido: "整理学习笔记，记录 Agent 应用和 Python 后端开发中的问题与实践。",
  about_skills: "Python,Agent 应用",
  about_github: process.env.NEXT_PUBLIC_GITHUB_URL || "",
}

export async function getPublicSettings(): Promise<PublicSettings> {
  try {
    const settings = await prisma.setting.findMany({
      where: { key: { in: [...PUBLIC_SETTING_KEYS] } },
    })
    const result = { ...DEFAULT_PUBLIC_SETTINGS }
    for (const setting of settings) {
      if (PUBLIC_SETTING_KEYS.includes(setting.key as PublicSettingKey)) {
        result[setting.key as PublicSettingKey] = setting.value
      }
    }
    return result
  } catch (error) {
    console.error("[PublicSettingsUnavailable]", error)
    return { ...DEFAULT_PUBLIC_SETTINGS }
  }
}
