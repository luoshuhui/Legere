export class RateLimiter {
  private requests: number[] = [];
  private units: { ts: number; n: number }[] = [];
  private readonly windowMs = 60_000;

  private prune(now: number) {
    const cutoff = now - this.windowMs;
    this.requests = this.requests.filter((t) => t > cutoff);
    this.units = this.units.filter((t) => t.ts > cutoff);
  }

  /**
   * 返回需要等待的秒数。0 表示可以立即请求。
   * @param rpm 每分钟请求数限制，0 或负数表示不限制
   * @param upm 每分钟单位数（Token/字符）限制，0 或负数表示不限制
   */
  getWaitSeconds(rpm: number, upm: number): number {
    const now = Date.now();
    this.prune(now);
    const cutoff = now - this.windowMs;

    if (rpm > 0 && this.requests.length >= rpm) {
      const oldest = this.requests[0]!;
      const waitMs = oldest - cutoff;
      return Math.ceil(waitMs / 1000);
    }

    if (upm > 0) {
      const totalUnits = this.units.reduce((s, t) => s + t.n, 0);
      if (totalUnits >= upm) {
        const oldest = this.units[0]!.ts;
        const waitMs = oldest - cutoff;
        return Math.ceil(waitMs / 1000);
      }
    }

    return 0;
  }

  /**
   * 记录一次请求及其单位数（Token/字符）
   */
  record(n: number) {
    const now = Date.now();
    this.requests.push(now);
    this.units.push({ ts: now, n });
    this.prune(now);
  }
}
