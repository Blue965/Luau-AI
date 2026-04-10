export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages array required' });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error('OPENROUTER_API_KEY not found');
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const systemMessage = {
      role: 'system',
      content: 'Tu es Luau AI, un assistant IA expert en scripting Roblox avec le langage Luau. Tu aides les utilisateurs à créer des scripts, déboguer du code, optimiser les performances et fournir des conseils sur le développement Roblox. Réponds toujours en français de manière claire et utile. Fournis des exemples de code précis et fonctionnels.'
    };

    const fullMessages = [
      systemMessage,
      ...messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.text
      }))
    ];

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'qwen/qwen2.5-7b-instruct:together',
        messages: fullMessages,
        max_tokens: 2000,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenRouter API error status:', response.status, 'body:', error);
      return res.status(response.status).json({ error: 'AI service error' });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content;

    if (!reply) {
      return res.status(500).json({ error: 'No response from AI' });
    }

    res.status(200).json({ reply });
  } catch (error) {
    console.error('Error calling OpenRouter:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}