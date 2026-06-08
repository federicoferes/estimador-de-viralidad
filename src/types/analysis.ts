export interface BrainDimension {
  label: string;
  score: number;
  description: string;
  roi: string;
}

export interface ViralityResult {
  overall_score: number;
  dimensions: BrainDimension[];
  verdict: string;
  recommendation: string;
  processing_time_ms: number;
  transcript?: string;
}

export interface LlmModel {
  id: string;       // OpenRouter slug
  label: string;    // display name
}

export const LLM_MODELS: LlmModel[] = [
  { id: "anthropic/claude-opus-4.8", label: "Claude" },
  { id: "openai/gpt-5.5",            label: "ChatGPT" },
  { id: "google/gemini-2.5-pro",     label: "Gemini" },
  { id: "x-ai/grok-4.3",             label: "Grok" },
  { id: "deepseek/deepseek-v3.2",    label: "DeepSeek" },
  { id: "qwen/qwen3.7-max",          label: "Qwen" },
];
