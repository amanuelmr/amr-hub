import { Resend } from "resend";
import { loadServerEnvironment } from "./env";

let client: Resend | null = null;

function getClient() {
  if (!client) {
    client = new Resend(loadServerEnvironment().RESEND_API_KEY);
  }
  return client;
}

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export async function sendEmail(input: EmailMessage) {
  const { error } = await getClient().emails.send({
    from: loadServerEnvironment().EMAIL_FROM,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });

  if (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }
}

const PLACEHOLDER_KEY_PREFIXES = ["re_your", "re_placeholder", "re_ci"];

/**
 * Notification emails (issue events, digests, filter subscriptions) are only
 * logged — never sent — when the Resend key is a dev/CI placeholder, or in
 * local development unless NOTIFICATION_EMAIL_DELIVERY=send opts in, so
 * working on the app never mails real or fake workspace members.
 */
export function shouldLogNotificationEmails(
  environment: NodeJS.ProcessEnv = process.env,
) {
  const key = environment.RESEND_API_KEY?.trim() ?? "";
  if (!key || PLACEHOLDER_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
    return true;
  }
  if (environment.NOTIFICATION_EMAIL_DELIVERY === "send") return false;
  if (environment.NOTIFICATION_EMAIL_DELIVERY === "log") return true;
  return environment.NODE_ENV === "development";
}

/**
 * Sends (or logs) a notification email. Never throws: a delivery failure must
 * not fail the request that triggered it. Returns whether it was handed off.
 */
export async function deliverNotificationEmail(message: EmailMessage) {
  try {
    if (shouldLogNotificationEmails()) {
      console.info(
        `[email:log] to=${message.to} subject=${JSON.stringify(message.subject)}\n${message.text}`,
      );
      return true;
    }
    await sendEmail(message);
    return true;
  } catch (error) {
    console.error("Failed to send notification email", error);
    return false;
  }
}
