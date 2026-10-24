/** Postgres error codes we turn into friendly messages. */
export function pgErrorCode(err: unknown): string | undefined {
  let e: unknown = err;
  // Drizzle wraps driver errors in `cause`.
  for (let i = 0; i < 3 && e && typeof e === "object"; i++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string") return code;
    e = (e as { cause?: unknown }).cause;
  }
  return undefined;
}

export const isUniqueViolation = (err: unknown) => pgErrorCode(err) === "23505";
export const isForeignKeyViolation = (err: unknown) => pgErrorCode(err) === "23503";
