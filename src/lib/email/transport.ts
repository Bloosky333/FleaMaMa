import "server-only";
import nodemailer from "nodemailer";
import { getSettings, type Settings } from "../editions";
import { unseal } from "../secret-box";

export type EmailConfig =
  | { mode: "gmail"; user: string; password: string; fromName: string }
  | { mode: "log" }
  | { mode: "none"; reason: string };

/**
 * Gmail via SMTP with an app password (spec §4.7), set in Paramètres. The GMAIL_* environment
 * variables are a fallback for installs configured before that. EMAIL_TRANSPORT=log only logs
 * the messages and marks them as sent: for development and tests.
 */
export async function emailConfig(settings?: Settings): Promise<EmailConfig> {
  if (process.env.EMAIL_TRANSPORT === "log") return { mode: "log" };
  const s = settings ?? (await getSettings());
  const fromName = s.emailFromName || process.env.EMAIL_FROM_NAME || "Brocante";
  if (s.gmailUser) {
    const password = s.gmailAppPasswordSealed ? unseal(s.gmailAppPasswordSealed) : null;
    if (!password) {
      return {
        mode: "none",
        reason: s.gmailAppPasswordSealed
          ? "Le mot de passe d’application ne peut plus être lu : saisissez-le à nouveau dans Paramètres."
          : "Le mot de passe d’application Gmail n’est pas renseigné (Paramètres).",
      };
    }
    return { mode: "gmail", user: s.gmailUser, password, fromName };
  }
  const user = process.env.GMAIL_USER;
  const password = process.env.GMAIL_APP_PASSWORD;
  if (user && password) return { mode: "gmail", user, password, fromName };
  return { mode: "none", reason: "Gmail n’est pas configuré (Paramètres → Envoi des emails)." };
}

type Message = { to: string; subject: string; text: string };

/** One SMTP connection setup per batch rather than per message. */
export function createMailer(config: EmailConfig): (msg: Message) => Promise<void> {
  if (config.mode === "none") {
    return async () => {
      throw new Error(config.reason);
    };
  }
  if (config.mode === "log") {
    return async (msg) => console.log(`[email:log] to=${msg.to} subject=${msg.subject}`);
  }
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: config.user, pass: config.password },
  });
  return async (msg) => {
    await transporter.sendMail({ from: { name: config.fromName, address: config.user }, ...msg });
  };
}

/** Whether the app creates emails at all (Paramètres → « Emails activés »). */
export async function emailsEnabled(): Promise<boolean> {
  return (await getSettings()).emailEnabled;
}
