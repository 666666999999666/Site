interface LoginAttemptRecord {
  count: number
  lastAttemptAt: number
  blockedUntil: number
}

export class LoginAttemptLimiter {
  private readonly records = new Map<string, LoginAttemptRecord>()

  constructor(
    private readonly maxFailures: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now
  ) {}

  isBlocked(key: string): boolean {
    const now = this.now()
    const record = this.records.get(key)
    if (!record) return false
    if (record.blockedUntil > now) return true
    if (this.isExpired(record, now)) this.records.delete(key)
    return false
  }

  recordFailure(key: string): void {
    const now = this.now()
    const previous = this.records.get(key)
    const count = previous && !this.isExpired(previous, now) ? previous.count + 1 : 1
    this.records.set(key, {
      count,
      lastAttemptAt: now,
      blockedUntil: count >= this.maxFailures ? now + this.windowMs : 0,
    })
  }

  clear(key: string): void {
    this.records.delete(key)
  }

  cleanup(): void {
    const now = this.now()
    for (const [key, record] of this.records) {
      if (this.isExpired(record, now)) this.records.delete(key)
    }
  }

  get size(): number {
    return this.records.size
  }

  private isExpired(record: LoginAttemptRecord, now: number): boolean {
    if (record.blockedUntil > 0) return record.blockedUntil <= now
    return record.lastAttemptAt + this.windowMs <= now
  }
}
