import { prisma } from "@/lib/db"
import {
  PUBLIC_SETTING_KEYS,
  type PublicSettingKey,
} from "@/lib/validation"

export type PublicSettings = Record<PublicSettingKey, string>

export const DEFAULT_PUBLIC_SETTINGS: PublicSettings = {
  owner_name: "QZ Site",
  email: "",
  home_tagline: "记录学习、想法与项目实践。",
  home_role: "开发者 / 持续学习者",
  about_intro: "",
  about_whatido: "",
  about_skills: "",
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
