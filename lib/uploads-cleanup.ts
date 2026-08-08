import fs from "fs/promises"
import { prisma } from "@/lib/db"
import { uploadFilePath } from "@/lib/uploads"

/**
 * #30: 删除上传文件，仅删除不被其他记录引用的文件，防误删共享图片。
 *
 * 引用检查（跨表字段不同，不能混用）：
 * - Post：content 用 contains 匹配，coverImage 用 equals 匹配，excludeId 仅此表生效
 * - Project：coverImage 字段用 equals 精确匹配（coverImage 是单个 URL），不传 excludeId
 *
 * @param urls 要删除的 URL 列表
 * @param excludeId 排除的 Post 记录 ID（仅 Post 表生效；Project 表不传）
 */
export async function deleteUploadFiles(urls: string[], excludeId?: string): Promise<void> {
  for (const url of urls) {
    const filePath = uploadFilePath(url)
    if (!filePath) continue

    const postCount = await prisma.post.count({
      where: {
        ...(excludeId ? { id: { not: excludeId } } : {}),
        OR: [
          { content: { contains: url } },
          { coverImage: url },
        ],
      },
    })
    const projectCount = await prisma.project.count({
      where: { coverImage: url },
    })

    // 没有其他记录引用时才删除文件
    if (postCount === 0 && projectCount === 0) {
      try {
        await fs.unlink(filePath)
      } catch {
        // 文件不存在则忽略
      }
    }
  }
}
