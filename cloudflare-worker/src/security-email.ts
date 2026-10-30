/** Security email transport. Missing configuration or delivery errors fail explicitly. */
import type { Env } from './types.ts';

export async function sendSecurityEmail(env: Env, to: string, subject: string, text: string): Promise<boolean> {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM) return false;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.RESEND_API_KEY}` },
      body: JSON.stringify({ from: env.RESEND_FROM, to: [to], subject, text }),
    });
    return response.ok;
  } catch { return false; }
}
