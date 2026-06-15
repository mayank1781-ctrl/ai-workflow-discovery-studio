import { setTimeout as sleepTimer } from 'node:timers/promises';

export const sleep = (ms) => (ms > 0 ? sleepTimer(ms) : Promise.resolve());

export function median(values) {
  const nums = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

export function pct(numerator, denominator, digits = 0) {
  if (!denominator) return null;
  return Number(((numerator / denominator) * 100).toFixed(digits));
}

export function round(value, digits = 2) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

export function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9$%.\s/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function compact(value, max = 160) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

export function stableId(prefix, index) {
  return `${prefix}-${String(index + 1).padStart(3, '0')}`;
}

export function safeJsonParse(text, fallback = null) {
  try { return JSON.parse(text); } catch { return fallback; }
}

export function flattenStrings(value, out = []) {
  if (value === null || value === undefined) return out;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    out.push(String(value));
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) flattenStrings(item, out);
    return out;
  }
  if (typeof value === 'object') {
    for (const item of Object.values(value)) flattenStrings(item, out);
  }
  return out;
}

export async function fetchJsonWithRetry(url, options = {}, settings = {}) {
  const attempts = settings.attempts || 5;
  const timeoutMs = settings.timeoutMs || 180_000;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      const text = await response.text();
      const json = safeJsonParse(text, { _rawText: text });
      if (response.ok) return json;
      const retryable = response.status === 429 || response.status >= 500;
      lastError = new Error(`${response.status} ${json?.error || json?.detail?.error?.message || text || response.statusText}`);
      lastError.status = response.status;
      if (!retryable || attempt === attempts) throw lastError;
    } catch (error) {
      lastError = error;
      if (attempt === attempts) throw error;
    } finally {
      clearTimeout(timeout);
    }
    const base = Math.min(20_000, 750 * 2 ** (attempt - 1));
    const jitter = Math.floor(Math.random() * 350);
    await sleep(base + jitter);
  }
  throw lastError || new Error(`Request failed: ${url}`);
}

export async function chatJson({ apiUrl, apiKey, model, messages, temperature = 0.2, maxTokens = 900, timeoutMs = 180_000 }) {
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured for model call.');
  const json = await fetchJsonWithRetry(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature,
      response_format: { type: 'json_object' },
      messages,
      max_tokens: maxTokens
    })
  }, { timeoutMs });
  const content = json?.choices?.[0]?.message?.content || '';
  const parsed = safeJsonParse(content);
  if (!parsed) throw new Error(`Model returned non-JSON content for ${model}.`);
  return parsed;
}

