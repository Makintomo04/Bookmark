import type Anthropic from "@anthropic-ai/sdk";

// The one way Bookmark talks to Claude. Every AI feature (import matching, Ask the shelf, recaps)
// goes through here, so the key check, the client, the timeout and the structured-output handling
// live in one place.
//
// The rules from the strategy apply to every caller: AI only does work the reader asked for, never
// talks about the reader, and is always labelled in the UI.
//
// Without ANTHROPIC_API_KEY nothing here makes a request: aiAvailable() is false and askJson throws an
// AiError of kind "unavailable", which callers turn into a skip or a "not available right now" state.
// The SDK is imported lazily, so pages that never call a model don't load it.
//
// Features take the call as a parameter (AskJson) so tests run them with a fake and no network.
// Kept free of "@/" imports so scripts can load it under plain Node.

export const AI_MODELS = {
  // Matching, intent parsing, short book-only reasons: small structured jobs. Cheap enough that a
  // Plus reader's fair-use ceiling costs cents a month.
  fast: "claude-haiku-5-5",
} as const;

// Per request. One retry on top (maxRetries), so a call can take up to twice this.
export const AI_TIMEOUT_MS = 25_000;

export type AiEffort = "low" | "medium" | "high";

export const aiAvailable = () => !!process.env.ANTHROPIC_API_KEY;

export type AiErrorKind = "unavailable" | "request" | "refused" | "truncated" | "invalid";

export class AiError extends Error {
  readonly kind: AiErrorKind;

  constructor(kind: AiErrorKind, message: string) {
    super(message);
    this.name = "AiError";
    this.kind = kind;
  }
}

let client: Promise<Anthropic> | null = null;

// The shared client, made on first use.
export function aiClient(): Promise<Anthropic> {
  if (!aiAvailable()) return Promise.reject(new AiError("unavailable", "ANTHROPIC_API_KEY isn't set"));
  client ??= import("@anthropic-ai/sdk").then(({ default: Anthropic }) => {
    // An organisation-level key (one not scoped to a workspace) must say which workspace to bill:
    // ANTHROPIC_WORKSPACE_ID from the Console's workspace settings. A workspace-scoped key needs nothing.
    const workspace = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
    return new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      maxRetries: 1,
      timeout: AI_TIMEOUT_MS,
      ...(workspace && { defaultHeaders: { "anthropic-workspace-id": workspace } }),
    });
  });
  return client;
}

export interface JsonRequest {
  system: string;
  prompt: string;
  // JSON Schema the answer must fit (Anthropic's structured outputs enforce it). No minimum/maximum
  // on numbers: structured outputs reject them, so callers clamp what comes back instead.
  schema: Record<string, unknown>;
  maxTokens: number;
  // How much the model thinks first. These are small, well-specified jobs: "low" unless measured otherwise.
  effort?: AiEffort;
  // false: answer straight away, no thinking first. For short, well-specified jobs where a reader is
  // waiting on the answer. Claude Haiku 5.5 accepts this at effort "high" or below.
  thinking?: boolean;
  model?: string;
  timeoutMs?: number;
}

export interface JsonAnswer {
  // Parsed, but not validated beyond the schema: callers read it defensively.
  data: unknown;
  usage: { inputTokens: number; outputTokens: number };
}

export type AskJson = (request: JsonRequest) => Promise<JsonAnswer>;

// One request whose answer is JSON fitting `schema`. Throws an AiError on any failure.
export const askJson: AskJson = async (request) => {
  const anthropic = await aiClient();
  let response: Anthropic.Message;
  try {
    response = await anthropic.messages.create(
      {
        model: request.model ?? AI_MODELS.fast,
        max_tokens: request.maxTokens,
        output_config: { effort: request.effort ?? "low", format: { type: "json_schema", schema: request.schema } },
        ...(request.thinking === false && { thinking: { type: "disabled" as const } }),
        system: request.system,
        messages: [{ role: "user", content: request.prompt }],
      },
      { timeout: request.timeoutMs ?? AI_TIMEOUT_MS },
    );
  } catch (err) {
    throw new AiError("request", err instanceof Error ? err.message : String(err));
  }
  if (response.stop_reason === "refusal") throw new AiError("refused", "The model declined the request.");
  if (response.stop_reason === "max_tokens") throw new AiError("truncated", "The model's answer was cut off.");
  const block = response.content.find((b) => b.type === "text");
  const text = block && block.type === "text" ? block.text : "";
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new AiError("invalid", "The model's answer wasn't valid JSON.");
  }
  return { data, usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens } };
};
