import { getEnv } from "./env";
import { query } from "./db";

interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderHtml(message: EmailMessage): string {
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;background:#f7f5ef;padding:24px">
  <div style="max-width:560px;margin:auto;background:#fff;border:1px solid #e5e0d5;border-radius:12px;padding:24px">
    <p style="margin:0 0 16px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#8a6d3b">CampusSphere</p>
    <h1 style="margin:0 0 16px;font-size:20px;color:#1f2418">${escapeHtml(message.subject)}</h1>
    <div style="font-size:15px;line-height:1.6;color:#333">${escapeHtml(message.text).replace(/\n/g, "<br/>")}</div>
    <p style="margin-top:24px;font-size:12px;color:#777">You received this because of activity on CampusSphere. Replies are not monitored.</p>
  </div></body></html>`;
}

/**
 * Sends one email and records the outcome. Transports:
 *  - console: development only, logs and records provider="console"
 *  - smtp:    nodemailer SMTP_URL
 *  - resend:  Resend HTTP API
 * Failures throw so the durable job can retry with backoff.
 */
export async function sendEmail(message: EmailMessage, jobId?: string | null): Promise<void> {
  const env = getEnv();
  const provider = env.EMAIL_TRANSPORT;
  let status: "sent" | "failed" = "sent";
  let error: string | null = null;

  try {
    if (provider === "console") {
      if (env.isProduction) {
        throw new Error("Refusing to use the console email transport in production");
      }
      console.info(`[email:console] to=${message.to} subject=${JSON.stringify(message.subject)}`);
    } else if (provider === "resend") {
      if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured");
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.RESEND_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: env.EMAIL_FROM,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          html: renderHtml(message),
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Resend responded ${response.status}: ${text.slice(0, 300)}`);
      }
    } else {
      if (!env.SMTP_URL) throw new Error("SMTP_URL is not configured");
      const nodemailer = await import("nodemailer");
      const transport = nodemailer.createTransport(env.SMTP_URL);
      await transport.sendMail({
        from: env.EMAIL_FROM,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: renderHtml(message),
      });
    }
  } catch (cause) {
    status = "failed";
    error = cause instanceof Error ? cause.message : String(cause);
    throw cause;
  } finally {
    await query(
      `insert into outbound_emails (job_id, recipient, subject, body, provider, status, error)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [jobId ?? null, message.to, message.subject, message.text, provider, status, error],
    ).catch(() => {});
  }
}

export async function emailConfigured(): Promise<boolean> {
  const env = getEnv();
  if (env.EMAIL_TRANSPORT === "console") return false;
  if (env.EMAIL_TRANSPORT === "smtp") return Boolean(env.SMTP_URL);
  return Boolean(env.RESEND_API_KEY);
}
