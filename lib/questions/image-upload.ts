import { ValidationError } from "@/lib/errors"

export async function readQuestionImageUpload(request: Request): Promise<File> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? ""
  if (!contentType.startsWith("multipart/form-data;")) {
    throw new ValidationError("请求必须使用 multipart/form-data")
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    throw new ValidationError("multipart 请求体无效")
  }

  const keys = [...new Set(formData.keys())]
  if (keys.some((key) => key !== "file") || formData.getAll("file").length !== 1) {
    throw new ValidationError("只允许上传一张图片")
  }
  const file = formData.get("file")
  if (!(file instanceof File)) throw new ValidationError("图片必填")
  return file
}
