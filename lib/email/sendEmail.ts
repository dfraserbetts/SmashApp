import "server-only";

import { Resend } from "resend";

export type EmailDeliveryStatus = "sent" | "logged" | "skipped" | "failed";
export type EmailProvider = "log" | "resend" | "unknown";

export type EmailDeliveryResult = {
  status: EmailDeliveryStatus;
  provider: EmailProvider;
  messageId?: string;
  error?: string;
};

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
};

export function getAppBaseUrl() {
  return (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export async function sendEmail(input: SendEmailInput): Promise<EmailDeliveryResult> {
  const transport = (process.env.EMAIL_TRANSPORT ?? "log").trim().toLowerCase();

  if (!transport || transport === "log") {
    console.info("[EMAIL:LOGGED]", {
      to: input.to,
      subject: input.subject,
      text: input.text,
    });

    return {
      status: "logged",
      provider: "log",
    };
  }

  if (transport !== "resend") {
    return {
      status: "failed",
      provider: "unknown",
      error: `Unknown EMAIL_TRANSPORT "${transport}". Expected "log" or "resend".`,
    };
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  const replyTo = process.env.EMAIL_REPLY_TO?.trim();

  if (!apiKey) {
    return {
      status: "failed",
      provider: "resend",
      error: "EMAIL_TRANSPORT=resend requires RESEND_API_KEY.",
    };
  }

  if (!from) {
    return {
      status: "failed",
      provider: "resend",
      error: "EMAIL_TRANSPORT=resend requires EMAIL_FROM.",
    };
  }

  try {
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      ...(replyTo ? { replyTo } : {}),
    });

    if (result.error) {
      return {
        status: "failed",
        provider: "resend",
        error: result.error.message,
      };
    }

    return {
      status: "sent",
      provider: "resend",
      messageId: result.data?.id,
    };
  } catch (error) {
    return {
      status: "failed",
      provider: "resend",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
