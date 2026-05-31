import "server-only";

export type EmailDeliveryResult =
  | { status: "sent"; sent: true; logged: false; skipped: false; failed: false }
  | { status: "logged"; sent: false; logged: true; skipped: false; failed: false }
  | { status: "skipped"; sent: false; logged: false; skipped: true; failed: false; reason: string }
  | { status: "failed"; sent: false; logged: false; skipped: false; failed: true; error: string };

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
};

export function getAppBaseUrl() {
  return (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export async function sendEmail(input: SendEmailInput): Promise<EmailDeliveryResult> {
  try {
    console.info("[EMAIL:LOGGED]", {
      to: input.to,
      subject: input.subject,
      text: input.text,
    });

    return {
      status: "logged",
      sent: false,
      logged: true,
      skipped: false,
      failed: false,
    };
  } catch (error) {
    return {
      status: "failed",
      sent: false,
      logged: false,
      skipped: false,
      failed: true,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
