import Anthropic from "@anthropic-ai/sdk";

/** Models offered in the UI. Default is the most capable; users pick per BYOK key. */
export const SUPPORTED_MODELS = [
  { id: "claude-opus-4-8", label: "Claude Opus 4.8 (most capable)" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (faster / cheaper)" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 (fastest)" },
] as const;

export const DEFAULT_MODEL = "claude-opus-4-8";

export interface GenerateArgs {
  system?: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
}

/**
 * Provider-agnostic LLM interface (Claude-first). A future OpenAI/other impl only
 * needs to satisfy this contract; the residuality operations don't depend on the
 * concrete provider.
 */
export interface LlmClient {
  readonly provider: string;
  /** Generate a completion and return the raw text. */
  generateText(args: GenerateArgs): Promise<string>;
}

/** Extract a JSON value from model text, tolerating ```json fences / prose. */
export function extractJson<T = unknown>(text: string): T {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1]!.trim() : trimmed;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    // Fall back to the first {...} or [...] span.
    const start = candidate.search(/[[{]/);
    const end = Math.max(candidate.lastIndexOf("}"), candidate.lastIndexOf("]"));
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1)) as T;
    }
    throw new Error("LLM did not return parseable JSON");
  }
}

export class AnthropicClient implements LlmClient {
  readonly provider = "anthropic";
  private readonly client: Anthropic;
  private readonly defaultModel: string;

  constructor(apiKey: string, defaultModel: string = DEFAULT_MODEL) {
    this.client = new Anthropic({ apiKey });
    this.defaultModel = defaultModel;
  }

  async generateText(args: GenerateArgs): Promise<string> {
    // Adaptive thinking suits the multi-step residuality reasoning; opus-4-8 and
    // sonnet-4-6 both support it. Non-streaming with a bounded max_tokens (<=16K)
    // stays under SDK HTTP timeouts.
    const body = {
      model: args.model ?? this.defaultModel,
      max_tokens: args.maxTokens ?? 16000,
      // Adaptive thinking is accepted at runtime on Opus 4.8 / Sonnet 4.6; the
      // installed SDK typings predate it, so assert the body shape.
      thinking: { type: "adaptive" },
      ...(args.system ? { system: args.system } : {}),
      messages: [{ role: "user", content: args.prompt }],
    } as unknown as Anthropic.MessageCreateParamsNonStreaming;
    const res = await this.client.messages.create(body);
    return res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
  }
}

export interface CreateClientOptions {
  provider?: string;
  apiKey: string;
  defaultModel?: string;
}

export function createLlmClient(opts: CreateClientOptions): LlmClient {
  const provider = opts.provider ?? "anthropic";
  if (provider !== "anthropic") {
    throw new Error(`Unsupported LLM provider '${provider}'. Only 'anthropic' is available at launch.`);
  }
  return new AnthropicClient(opts.apiKey, opts.defaultModel ?? DEFAULT_MODEL);
}
