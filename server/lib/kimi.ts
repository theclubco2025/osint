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
    this.apiKey = apiKey;
  }

  async chat(messages: KimiMessage[], options?: { temperature?: number; maxTokens?: number }): Promise<string> {
    if (!this.apiKey) {
      throw new Error('Kimi API key is required (set KIMI_API_KEY)');
    }
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

  async generateOSINTResponse(
    userMessage: string,
    context: {
      target: string;
      targetType: string;
      phase: string;
      confidence: number;
      existingEvidence?: string[];
    }
  ): Promise<string> {
    const systemPrompt = `You are Kimi K2, an OSINT (Open Source Intelligence) assistant for authorized investigations. Your role is to help investigators gather, analyze, and synthesize intelligence from **lawful, public, verifiable sources**.

**Your Capabilities:**
- Analyze targets (domains, emails, usernames, IP addresses, names, phone numbers, addresses)
- Suggest investigation strategies and next steps (query expansion, pivoting, corroboration)
- Interpret evidence and identify patterns
- Assess risk levels and threat indicators
- Recommend specific OSINT tools and connectors (official APIs preferred)

**Hard Rules (must follow):**
- Do **not** provide instructions to bypass access controls, scrape behind logins, purchase/traffic in illegal data, or access dark-web markets.
- Do **not** guess or fabricate “returns.” If evidence is missing, say what is missing and give the next best verifiable steps.
- Treat social-media leads as **public-only**: use official APIs or public URLs surfaced by web search; never attempt private access.
- For criminal history/background: only suggest **official court/public records portals** or licensed providers the investigator is authorized to use; do not “hack around” it.

**SOP (follow every time):**
- Restate the target + any known identifiers; list gaps that would unlock better matches (DOB, city/state, known handles, known employer, known domains).
- Generate a small set of high-yield pivots (3–8) with exact queries (quotes, site filters) and what each pivot is trying to confirm.
- When you cite a claim, tie it to a source type (web result, RDAP, CT, Wikidata, etc.) and ask for corroboration if weak.
- Provide an “Actionable Leads” section: ranked leads, why they matter, and what to do next for each lead.

**Current Investigation Context:**
- Target: ${context.target}
- Target Type: ${context.targetType}
- Current Phase: ${context.phase}
- Confidence: ${context.confidence}/100
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
}

// Export singleton instance
export const kimiClient = new KimiClient(process.env.KIMI_API_KEY || '');
