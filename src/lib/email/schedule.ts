/** Pure helpers for the outbox pacing (no server dependencies, unit-tested). */

/** Rough time to empty the queue: batches every ~10 minutes, capped per 24 h. */
export function estimateDelay(
  queued: number,
  sentToday: number,
  batchSize: number,
  dailyCap: number,
): string {
  if (queued === 0) return "";
  const todayLeft = Math.max(0, dailyCap - sentToday);
  if (queued <= todayLeft) {
    const minutes = Math.ceil(queued / batchSize) * 10;
    return minutes <= 10
      ? "dans les prochaines minutes"
      : `≈ ${minutes < 60 ? `${minutes} min` : `${Math.ceil(minutes / 60)} h`}`;
  }
  const days = 1 + Math.ceil((queued - todayLeft) / dailyCap);
  return `≈ ${days} jours (limite de ${dailyCap} emails par 24 h)`;
}

/** Errors meaning "Gmail refuses for now" (quota, rate limit): pause instead of retrying. */
export function isQuotaError(err: unknown): boolean {
  const e = err as { responseCode?: number; response?: string; message?: string };
  const text = `${e.response ?? ""} ${e.message ?? ""}`;
  return (
    e.responseCode === 421 ||
    e.responseCode === 454 ||
    /5\.4\.5|4\.7\.0|limit exceeded|rate limit|too many/i.test(text)
  );
}
