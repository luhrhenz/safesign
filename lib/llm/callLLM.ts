/**
 * OPTIONAL rephrase layer (README §2, Phase 8).
 *
 * This never decides anything. The verdict is already final when this runs; all
 * it may do is say the same reasons in friendlier words. It is called only for
 * the ambiguous middle, it is given the findings and never the contract source,
 * and every failure path returns null so the caller keeps the rules wording.
 *
 * Providers are tried in order — different free tiers reset on different clocks,
 * so a 429 on one is rarely a 429 on all. With no keys set, nothing is called.
 */

import type { Verdict } from "../types";

const TIMEOUT_MS = 8000;

/**
 * Model defaults, checked against the live catalogues on 2026-09-08.
 * Groq has retired the Llama 3.3 line; this qwen answers in ~0.6s, returns
 * valid JSON on every run, and did not soften a DANGER across repeated tries.
 */
const DEFAULT_GROQ_MODEL = "qwen/qwen3.8-27b";

/**
 * Gemini's 3.x flash models spend output tokens on hidden reasoning and
 * truncate mid-JSON at a small cap (measured: 6s and 27s, both unparseable),
 * so the lite alias is the default here — ~1.1s and clean JSON.
 */
const DEFAULT_GEMINI_MODEL = "gemini-flash-lite-latest";

const SYSTEM_PROMPT = `You rewrite safety warnings for people who are new to crypto, reading on a phone, in a second or third language.

You are given a verdict and the reasons behind it. Say the SAME things in simpler words.

Rules:
- Do not change the meaning. Do not add a reason. Do not remove a reason. Do not soften a warning.
- Never say something is safe. That decision is already made and is not yours.
- Keep any "it depends who runs it" wording. A line saying what the owner CAN do is a disclosure, not an accusation — do not rewrite it into one.
- Short, ordinary sentences. No jargon: no "contract", "approval", "mint", "proxy", "owner-only".
- Each reason is one sentence about what could happen to the person's money.
- Return ONLY this JSON, no markdown: {"reasons": ["...", "..."], "whatToDo": "..."}`;

export interface RephraseInput {
  verdict: Verdict;
  reasons: string[];
  whatToDo: string;
}

export interface RephraseOutput {
  reasons: string[];
  whatToDo: string;
}

type Provider = { name: string; enabled: () => boolean; call: (prompt: string) => Promise<string> };

const PROVIDERS: Provider[] = [
  {
    name: "groq",
    enabled: () => Boolean(process.env.GROQ_API_KEY),
    call: (prompt) =>
      openAiCompatible(
        "https://api.groq.com/openai/v1/chat/completions",
        process.env.GROQ_API_KEY!,
        process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL,
        prompt,
      ),
  },
  {
    name: "gemini",
    enabled: () => Boolean(process.env.GEMINI_API_KEY),
    call: (prompt) => gemini(prompt),
  },
  {
    name: "openrouter",
    enabled: () => Boolean(process.env.OPENROUTER_API_KEY),
    call: (prompt) =>
      openAiCompatible(
        "https://openrouter.ai/api/v1/chat/completions",
        process.env.OPENROUTER_API_KEY!,
        process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free",
        prompt,
      ),
  },
  {
    name: "ollama",
    enabled: () => Boolean(process.env.OLLAMA_URL),
    call: (prompt) => ollama(prompt),
  },
];

/** True when at least one provider is configured. */
export function rephraseAvailable(): boolean {
  return PROVIDERS.some((p) => p.enabled());
}

/**
 * Returns friendlier wording, or null — and null is a perfectly good outcome.
 * The caller keeps the rules wording and the user never knows.
 */
export async function rephrase(input: RephraseInput): Promise<RephraseOutput | null> {
  const prompt = buildPrompt(input);

  for (const provider of PROVIDERS) {
    if (!provider.enabled()) continue;
    try {
      const raw = await provider.call(prompt);
      const parsed = parseOutput(raw, input);
      if (parsed) return parsed;
    } catch (err) {
      console.warn(`rephrase: ${provider.name} failed`, err);
    }
  }

  return null;
}

function buildPrompt(input: RephraseInput): string {
  return [
    `Verdict (already decided, do not change): ${input.verdict}`,
    "Reasons:",
    ...input.reasons.map((r) => `- ${r}`),
    `What to do: ${input.whatToDo}`,
  ].join("\n");
}

/**
 * Strict: same number of reasons, no empty strings, nothing absurdly long.
 * Anything else and we keep the rules wording.
 */
export function parseOutput(raw: string, input: RephraseInput): RephraseOutput | null {
  const json = stripToJson(raw);
  if (!json) return null;

  try {
    const parsed = JSON.parse(json);
    const reasons = parsed?.reasons;
    const whatToDo = parsed?.whatToDo;

    const validReasons =
      Array.isArray(reasons) &&
      reasons.length === input.reasons.length &&
      reasons.every((r: unknown) => typeof r === "string" && r.trim().length > 0 && r.length < 300);

    const validAction =
      typeof whatToDo === "string" && whatToDo.trim().length > 0 && whatToDo.length < 300;

    if (!validReasons || !validAction) return null;
    return { reasons: reasons.map((r: string) => r.trim()), whatToDo: whatToDo.trim() };
  } catch {
    return null;
  }
}

/** Models like to wrap JSON in prose, fences, or <think> blocks. */
export function stripToJson(raw: string): string {
  const text = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/```(?:json)?/gi, "")
    .trim();

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start !== -1 && end > start ? text.slice(start, end + 1) : "";
}

async function openAiCompatible(
  url: string,
  apiKey: string,
  model: string,
  prompt: string,
): Promise<string> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 800,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

async function gemini(prompt: string): Promise<string> {
  const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\n${prompt}` }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1500 },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
  );

  if (!res.ok) throw new Error(`gemini responded ${res.status}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function ollama(prompt: string): Promise<string> {
  const base = process.env.OLLAMA_URL!.replace(/\/$/, "");
  const res = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OLLAMA_MODEL || "llama3.2",
      stream: false,
      options: { temperature: 0.2 },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`ollama responded ${res.status}`);
  const data = await res.json();
  return data.message?.content ?? "";
}
