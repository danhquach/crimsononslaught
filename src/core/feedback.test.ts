import { describe, expect, it } from 'vitest';
import {
  FEEDBACK_COOLDOWN_MS,
  MAX_MESSAGE_LENGTH,
  MAX_SUBJECT_LENGTH,
  feedbackAvailable,
  feedbackCooldownLeftMs,
  feedbackPayload,
  validateFeedback,
} from './feedback';

describe('feedbackAvailable', () => {
  it('needs a non-blank key', () => {
    expect(feedbackAvailable(undefined)).toBe(false);
    expect(feedbackAvailable('')).toBe(false);
    expect(feedbackAvailable('   ')).toBe(false);
    expect(feedbackAvailable('test-key')).toBe(true);
  });
});

describe('validateFeedback', () => {
  it('accepts a subject and a message', () => {
    expect(validateFeedback({ subject: 'Hi', message: 'Nice game' })).toBeNull();
  });

  it('refuses a blank or whitespace-only field', () => {
    expect(validateFeedback({ subject: '', message: 'x' })).not.toBeNull();
    expect(validateFeedback({ subject: 'x', message: '' })).not.toBeNull();
    expect(validateFeedback({ subject: '  ', message: '\n\t' })).not.toBeNull();
  });

  it('holds each field to its cap, after trimming', () => {
    const subject = 'a'.repeat(MAX_SUBJECT_LENGTH);
    const message = 'b'.repeat(MAX_MESSAGE_LENGTH);
    expect(validateFeedback({ subject: ` ${subject} `, message: ` ${message} ` })).toBeNull();
    expect(validateFeedback({ subject: `${subject}a`, message })).toContain(
      `${MAX_SUBJECT_LENGTH}`,
    );
    expect(validateFeedback({ subject, message: `${message}b` })).toContain(
      `${MAX_MESSAGE_LENGTH}`,
    );
  });
});

describe('feedbackPayload', () => {
  it('prefixes the subject and carries the message, version, key and an empty honeypot', () => {
    expect(feedbackPayload({ subject: ' Bug ', message: ' It broke \n' }, '0.1.0', 'k')).toEqual({
      access_key: 'k',
      subject: '[CrimsonOnslaught] Feedback: Bug',
      message: 'It broke',
      version: '0.1.0',
      botcheck: '',
    });
  });

  it('passes a filled honeypot through, for the service to drop', () => {
    expect(feedbackPayload({ subject: 's', message: 'm' }, '1', 'k', 'on').botcheck).toBe('on');
  });
});

describe('feedbackCooldownLeftMs', () => {
  it('is zero before any send and once the cooldown has run out', () => {
    expect(feedbackCooldownLeftMs(null, 5)).toBe(0);
    expect(feedbackCooldownLeftMs(1000, 1000 + FEEDBACK_COOLDOWN_MS)).toBe(0);
    expect(feedbackCooldownLeftMs(1000, 1000 + FEEDBACK_COOLDOWN_MS + 1)).toBe(0);
  });

  it('counts down from a send', () => {
    expect(feedbackCooldownLeftMs(1000, 1000)).toBe(FEEDBACK_COOLDOWN_MS);
    expect(feedbackCooldownLeftMs(1000, 11_000)).toBe(FEEDBACK_COOLDOWN_MS - 10_000);
  });
});
