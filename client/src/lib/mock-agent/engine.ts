export const MOCK_AGENT_RESPONSES = [
  {
    trigger: 'analyze',
    steps: ['Accessing knowledge base...', 'Cross-referencing OSINT databases...', 'Synthesizing findings...'],
    response: `**Analysis Complete.**

I have analyzed the target domain **crypto-nexus-ring.com**. Here are the key findings:

1.  **Registrar Data**: The domain was registered via *NameCheap* on 2023-11-12. Privacy protection is enabled, but historical records suggest a link to email \`admin@nexus-ops.net\`.
2.  **Server Infrastructure**: Hosted on DigitalOcean (SGP region).
3.  **Vulnerabilities**: Shodan scan indicates open port 22 (SSH) and 8080 (Jenkins).

**Recommended Actions:**
-   Initiate deep scan on port 8080.
-   Search \`admin@nexus-ops.net\` in breach databases.
`
  },
  {
    trigger: 'default',
    steps: ['Processing query...', 'Consulting strategy engine...'],
    response: `I've received your request. I'm currently scanning the available data points. 

Could you clarify if you want me to prioritize **network infrastructure** or **social engineering** vectors for this phase?`
  }
];

export async function simulateAgentResponse(
  input: string, 
  onStep: (step: string) => void, 
  onStream: (chunk: string) => void
): Promise<void> {
  const match = MOCK_AGENT_RESPONSES.find(r => input.toLowerCase().includes(r.trigger)) || MOCK_AGENT_RESPONSES[1];
  
  // Simulate thinking steps
  for (const step of match.steps) {
    onStep(step);
    await new Promise(r => setTimeout(r, 800 + Math.random() * 500));
  }
  
  // Simulate streaming text
  const chars = match.response.split('');
  let currentText = '';
  
  for (const char of chars) {
    currentText += char;
    onStream(currentText); 
    await new Promise(r => setTimeout(r, 15 + Math.random() * 30));
  }
}
