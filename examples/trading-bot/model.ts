// The model's one call: it reads a summary the bot wrote and may answer with one propose_swap. Its answer is data the
// rails read (rails.ts readProposal), never an instruction. Swap `anthropicProposal` for your provider's call: OpenAI's and
// xAI's tools take the same JSON Schema as `parameters`.

/** propose_swap, as packages/docs/content/docs/agents/ai-agents.mdx defines it, its token list the bot's own. */
export function proposeSwapTool(tokens: readonly string[]) {
  return {
    name: 'propose_swap',
    description: 'Propose one swap. It is checked against the rails, simulated, and sent only where every check passes.',
    input_schema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', enum: [...tokens], description: 'A token from the list you were given.' },
        side: { type: 'string', enum: ['buy', 'sell'], description: 'buy spends ether on the token; sell sells the token for ether.' },
        shareBps: { type: 'integer', minimum: 1, maximum: 10_000, description: 'The share of the holding to spend, in basis points.' },
        reason: { type: 'string', maxLength: 280, description: 'One sentence for the log.' },
      },
      required: ['token', 'side', 'shareBps', 'reason'],
      additionalProperties: false,
    },
  }
}

const SYSTEM = 'You manage a small trading wallet on Robinhood Chain. Read the summary, then call propose_swap at most once, '
  + 'or answer in one sentence why no trade is worth making. Every proposal is checked against rails you cannot change.'

/** Claude, through Anthropic's SDK (ANTHROPIC_API_KEY in .env): the propose_swap input it chose, or null. */
export async function anthropicProposal(summary: string, tokens: readonly string[], model: string): Promise<unknown> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic()
  const message = await client.beta.messages.create({
    model,
    max_tokens: 16_000,
    // a request the model's safety classifiers decline is re-run on Anthropic's recommended fallback model
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM,
    tools: [{ ...proposeSwapTool(tokens), strict: true }],
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: summary }],
  })
  if (message.stop_reason === 'refusal') return null
  const call = message.content.find((b) => b.type === 'tool_use' && b.name === 'propose_swap')
  return call && call.type === 'tool_use' ? call.input : null
}

/** An offline stand-in: the proposal written in STUB_PROPOSAL, for a run with no model and for tests. */
export function stubProposal(json: string): () => Promise<unknown> {
  return async () => JSON.parse(json) as unknown
}
