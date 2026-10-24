import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

export type EmailConfig =
  { mode: "gmail"; user: string; fromName: string } | { mode: "log" } | { mode: "none" };

/**
 * Gmail via SMTP with an app password (spec §4.7). EMAIL_TRANSPORT=log only logs the
 * messages and marks them as sent: for development and tests.
 */
export function emailConfig(): EmailConfig {
  if (process.env.EMAIL_TRANSPORT === "log") return { mode: "log" };
  const user = process.env.GMAIL_USER;
  if (user && process.env.GMAIL_APP_PASSWORD) {
    return { mode: "gmail", user, fromName: process.env.EMAIL_FROM_NAME ?? "Brocante" };
  }
  return { mode: "none" };
}

let transporter: Transporter | null = null;

export async function sendMail(msg: { to: string; subject: string; text: string }): Promise<void> {
  const config = emailConfig();
  if (config.mode === "none") throw new Error("Envoi d’emails non configuré.");
  if (config.mode === "log") {
    console.log(`[email:log] to=${msg.to} subject=${msg.subject}`);
    return;
  }
  transporter ??= nodemailer.createTransport({
    service: "gmail",
    auth: { user: config.user, pass: process.env.GMAIL_APP_PASSWORD },
  });
  await transporter.sendMail({ from: { name: config.fromName, address: config.user }, ...msg });
}
