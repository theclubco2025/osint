// Kimi K2 API Integration
// Documentation: https://platform.moonshot.cn/docs

interface KimiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface KimiChatRequest {
  model: string;
  messages: KimiMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

interface KimiChatStreamChunk {
  id?: string;
  choices?: Array<{
    delta?: { content?: string; role?: string };
    index?: number;
    finish_reason?: string | null;
  }>;
}

interface KimiChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class KimiClient {
  private apiKey: string;
  private baseUrl: string = 'https://api.moonshot.cn/v1';

  constructor(apiKey: string) {
    if (!apiKey) throw new Error('Kimi API key is required');
    this.apiKey = apiKey;
  }

  async chat(messages: KimiMessage[], options?: { temperature?: number; maxTokens?: number }): Promise<string> {
    const request: KimiChatRequest = {
      model: 'moonshot-v1-8k', // Using the 8k context model
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 2000,
      stream: false,
    };

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Kimi API error:', response.status, errorText);
        throw new Error(`Kimi API error: ${response.status} - ${errorText}`);
      }

      const data: KimiChatResponse = await response.json();
      
      if (!data.choices || data.choices.length === 0) {
        throw new Error('No response from Kimi API');
      }

      return data.choices[0].message.content;
    } catch (error) {
      console.error('Error calling Kimi API:', error);
      throw error;
    }
  }

  /**
   * Stream chat completions (OpenAI-compatible SSE).
   * Yields incremental text chunks.
   */
  async *chatStream(messages: KimiMessage[], options?: { temperature?: number; maxTokens?: number }): AsyncGenerator<string> {
    const request: KimiChatRequest = {
      model: "moonshot-v1-8k",
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 2000,
      stream: true,
    };

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok || !response.body) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`Kimi API streaming error: ${response.status} - ${errorText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by newlines.
      while (true) {
        const idx = buffer.indexOf("\n");
        if (idx === -1) break;
        const line = buffer.slice(0, idx).trimEnd();
        buffer = buffer.slice(idx + 1);

        const trimmed = line.trim();
        if (!trimmed) continue;
        if (!trimmed.startsWith("data:")) continue;

        const data = trimmed.slice("data:".length).trim();
        if (data === "[DONE]") return;

        try {
          const parsed = JSON.parse(data) as KimiChatStreamChunk;
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // ignore malformed chunk
        }
      }
    }
  }

  async generateOSINTResponse(
    userMessage: string,
    context: {
      target: string;
      targetType: string;
      phase: string;
      riskScore: number;
      existingEvidence?: string[];
    }
  ): Promise<string> {
    const systemPrompt = `You are Kimi K2, an advanced OSINT (Open Source Intelligence) AI agent. Your role is to assist investigators in gathering, analyzing, and synthesizing intelligence from public sources.

**Your Capabilities:**
- Analyze targets (domains, emails, usernames, IP addresses)
- Suggest investigation strategies and next steps
- Interpret evidence and identify patterns
- Assess risk levels and threat indicators
- Recommend specific OSINT tools and connectors

**Current Investigation Context:**
- Target: ${context.target}
- Target Type: ${context.targetType}
- Current Phase: ${context.phase}
- Risk Score: ${context.riskScore}/100
${context.existingEvidence && context.existingEvidence.length > 0 ? `\n**Existing Evidence:**\n${context.existingEvidence.map((e, i) => `${i + 1}. ${e}`).join('\n')}` : ''}

**Guidelines:**
- Be professional and concise
- Provide actionable intelligence
- Use technical OSINT terminology
- Prioritize ethical and legal collection methods
- Format responses in Markdown for clarity
- When suggesting scans, be specific about what tools/databases to check

Respond to the investigator's query with expert OSINT guidance.`;

    const messages: KimiMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    return this.chat(messages, { temperature: 0.7, maxTokens: 1500 });
  }

  async *generateOSINTResponseStream(
    userMessage: string,
    context: {
      target: string;
      targetType: string;
      phase: string;
      riskScore: number;
      existingEvidence?: string[];
    },
  ): AsyncGenerator<string> {
    const systemPrompt = `You are Kimi K2, an advanced OSINT (Open Source Intelligence) AI agent. Your role is to assist investigators in gathering, analyzing, and synthesizing intelligence from public sources.

**Your Capabilities:**
- Analyze targets (domains, emails, usernames, IP addresses)
- Suggest investigation strategies and next steps
- Interpret evidence and identify patterns
- Assess risk levels and threat indicators
- Recommend specific OSINT tools and connectors

**Current Investigation Context:**
- Target: ${context.target}
- Target Type: ${context.targetType}
- Current Phase: ${context.phase}
- Risk Score: ${context.riskScore}/100
${context.existingEvidence && context.existingEvidence.length > 0 ? `\n**Existing Evidence:**\n${context.existingEvidence.map((e, i) => `${i + 1}. ${e}`).join("\n")}` : ""}

**Guidelines:**
- Be professional and concise
- Provide actionable intelligence
- Use technical OSINT terminology
- Prioritize ethical and legal collection methods
- Format responses in Markdown for clarity
- When suggesting scans, be specific about what tools/databases to check

Respond to the investigator's query with expert OSINT guidance.`;

    const messages: KimiMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ];

    yield* this.chatStream(messages, { temperature: 0.7, maxTokens: 1500 });
  }
}

/**
 * Export a best-effort singleton.
 *
 * Important: the server must not crash at import-time if KIMI_API_KEY is unset.
 * When unset, routes should return a clear 503/424-style error instructing
 * operators to configure the key.
 */
export const kimiClient: KimiClient | null = process.env.KIMI_API_KEY
  ? new KimiClient(process.env.KIMI_API_KEY)
  : null;
