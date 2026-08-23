import { AppError } from "@/lib/errors"

export class ReviewConflictError extends AppError {
  constructor(message = "题目状态已变化，请刷新后重试") {
    super(message, "REVIEW_CONFLICT", 409)
  }
}
export class ResyncRequiredError extends AppError {
  constructor(message = "学习进度已变化，正在重新同步") {
    super(message, "RESYNC_REQUIRED", 409)
  }
}
