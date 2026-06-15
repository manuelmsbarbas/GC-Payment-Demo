import { env } from '../config/env';

const GC_BASE = 'https://api-sandbox.gocardless.com';

export async function gcFetch<T>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const res = await fetch(`${GC_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${env.gcAccessToken}`,
      'Content-Type': 'application/json',
      'GoCardless-Version': '2015-07-06',
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const data = (await res.json()) as T;

  if (!res.ok) {
    const errBody = data as { error?: { message?: string } };
    throw new Error(errBody.error?.message ?? `GoCardless API error ${res.status}`);
  }

  return data;
}
