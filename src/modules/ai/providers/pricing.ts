/** USD per 1M tokens. Estimates only; never used for billing without reconciliation. */
interface ModelPrice {
  input: number
  output: number
}

const OPENAI_PRICES: Record<string, ModelPrice> = {
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4.1': { input: 2, output: 8 },
}

export function estimateOpenAiCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const price = OPENAI_PRICES[model]
  if (!price) return 0
  return ((promptTokens * price.input) + (completionTokens * price.output)) / 1_000_000
}
