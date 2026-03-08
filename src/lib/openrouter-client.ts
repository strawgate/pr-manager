import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";

export async function generateOpenrouterText(params: {
  apiKey: string;
  prompt: string;
  model?: string;
}): Promise<string> {
  const { apiKey, prompt, model = "openai/gpt-4o-mini" } = params;
  if (!apiKey.trim()) {
    throw new Error("OpenRouter API key is required");
  }
  if (!prompt.trim()) {
    throw new Error("Prompt is required");
  }

  const openrouter = createOpenRouter({ apiKey: apiKey.trim() });
  const { text } = await generateText({
    model: openrouter(model),
    prompt,
  });

  return text;
}
