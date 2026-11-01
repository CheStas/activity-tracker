import { describe, expect, it } from 'vitest';
import { onRequestPost } from '../functions/api/feedback.ts';

const URL = 'https://tracker.example/api/feedback';

function setup() {
  const stored: Record<string, string> = {};
  const env = { FEEDBACK: { put: async (key: string, value: string) => void (stored[key] = value) } };
  const post = (body: unknown, headers: Record<string, string> = {}) => onRequestPost({
    request: new Request(URL, {
      method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: { 'content-type': 'application/json', ...headers },
    }),
    env,
  });
  return { stored, post, env };
}

describe('feedback function', () => {
  it('stores a message with the optional fields', async () => {
    const { stored, post } = setup();
    const res = await post({ message: ' Love it ', email: 'a@b.co', version: 'v1.0.0', browser: 'UA' });
    expect(res.status).toBe(200);
    const saved = Object.values(stored).map((v) => JSON.parse(v));
    expect(saved).toEqual([expect.objectContaining({ message: 'Love it', email: 'a@b.co', version: 'v1.0.0', browser: 'UA' })]);
  });

  it('rejects a missing message, a bad email, long fields and non-JSON', async () => {
    const { stored, post } = setup();
    expect((await post({ message: '  ' })).status).toBe(400);
    expect((await post({ message: 'hi', email: 'nope' })).status).toBe(400);
    expect((await post({ message: 'x'.repeat(4001) })).status).toBe(400);
    expect((await post({ message: 'hi', browser: 42 })).status).toBe(400);
    expect((await post('{oops')).status).toBe(400);
    expect((await post({ message: 'hi' }, { 'content-type': 'text/plain' })).status).toBe(415);
    expect(Object.keys(stored)).toHaveLength(0);
  });

  it('drops honeypot hits quietly and refuses other origins', async () => {
    const { stored, post } = setup();
    expect((await post({ message: 'buy now', website: 'spam.example' })).status).toBe(200);
    expect((await post({ message: 'hi' }, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await post({ message: 'hi' }, { origin: 'https://tracker.example' })).status).toBe(200);
    expect(Object.keys(stored)).toHaveLength(1);
  });

  it('answers 503 until the KV namespace is bound', async () => {
    const res = await onRequestPost({ request: new Request(URL, { method: 'POST', body: '{}' }), env: {} });
    expect(res.status).toBe(503);
  });
});
