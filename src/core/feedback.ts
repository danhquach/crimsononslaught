/**
 * The Help screen's feedback form (#226), as pure rules: what counts as a
 * sendable message and the JSON the form-to-email service takes. The game is
 * static, so the service mails it on; its access key is public by design and
 * reaches the bundle from the build's environment, never from the repo.
 *
 * Pure TS, no Phaser import.
 */

/** Where the form posts. */
export const FEEDBACK_URL = 'https://api.web3forms.com/submit';

/** Every feedback email's subject starts with this, so the inbox can filter them. */
export const FEEDBACK_SUBJECT_PREFIX = '[CrimsonOnslaught] Feedback: ';

export const MAX_SUBJECT_LENGTH = 80;

export const MAX_MESSAGE_LENGTH = 2000;

/** After a send the button stays off this long, so the public key cannot be hammered from here. */
export const FEEDBACK_COOLDOWN_MS = 30_000;

export interface FeedbackInput {
  subject: string;
  message: string;
}

/** What the service is posted. `botcheck` is its honeypot: a person never fills it in. */
export interface FeedbackPayload {
  access_key: string;
  subject: string;
  message: string;
  version: string;
  botcheck: string;
}

/** A build can send only with a key; without one the About tab says so instead of opening the form. */
export function feedbackAvailable(key: string | undefined): key is string {
  return typeof key === 'string' && key.trim().length > 0;
}

/** Why the input cannot be sent, as the form shows it, or `null` when it can. */
export function validateFeedback(input: Readonly<FeedbackInput>): string | null {
  const subject = input.subject.trim();
  const message = input.message.trim();
  if (subject.length === 0 || message.length === 0) return 'Enter a subject and a message.';
  if (subject.length > MAX_SUBJECT_LENGTH) {
    return `Keep the subject to ${MAX_SUBJECT_LENGTH} characters.`;
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return `Keep the message to ${MAX_MESSAGE_LENGTH} characters.`;
  }
  return null;
}

/** The service's JSON for a valid input; both fields go out trimmed. */
export function feedbackPayload(
  input: Readonly<FeedbackInput>,
  version: string,
  key: string,
  honeypot = '',
): FeedbackPayload {
  return {
    access_key: key,
    subject: FEEDBACK_SUBJECT_PREFIX + input.subject.trim(),
    message: input.message.trim(),
    version,
    botcheck: honeypot,
  };
}

/** Ms left before Send is back on, given when the last send succeeded (`null`: never). */
export function feedbackCooldownLeftMs(lastSentAt: number | null, now: number): number {
  if (lastSentAt === null) return 0;
  return Math.max(0, lastSentAt + FEEDBACK_COOLDOWN_MS - now);
}
