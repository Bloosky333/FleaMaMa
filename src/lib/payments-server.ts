import "server-only";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { payments, users } from "@/db/schema";

/** Sum of payments (refunds negative) per booking. */
export async function paidTotals(bookingIds: number[]): Promise<Map<number, number>> {
  if (!bookingIds.length) return new Map();
  const rows = await db
    .select({ bookingId: payments.bookingId, total: sql<number>`sum(${payments.amountCents})::int` })
    .from(payments)
    .where(inArray(payments.bookingId, bookingIds))
    .groupBy(payments.bookingId);
  return new Map(rows.map((r) => [r.bookingId, r.total]));
}

export async function recordPayment(input: {
  bookingId: number;
  amountCents: number;
  method: "cash" | "transfer";
  paidAt: string;
  reference?: string;
  userId: number;
}) {
  await db.insert(payments).values({
    bookingId: input.bookingId,
    amountCents: input.amountCents,
    method: input.method,
    paidAt: input.paidAt,
    reference: input.reference ?? "",
    recordedBy: input.userId,
  });
}

export async function listPayments(bookingId: number) {
  return db
    .select({
      id: payments.id,
      amountCents: payments.amountCents,
      method: payments.method,
      paidAt: payments.paidAt,
      reference: payments.reference,
      recordedBy: users.name,
    })
    .from(payments)
    .leftJoin(users, eq(users.id, payments.recordedBy))
    .where(eq(payments.bookingId, bookingId))
    .orderBy(desc(payments.paidAt), desc(payments.id));
}

export async function deletePayment(paymentId: number) {
  const [row] = await db
    .delete(payments)
    .where(eq(payments.id, paymentId))
    .returning({ bookingId: payments.bookingId });
  return row?.bookingId ?? null;
}
