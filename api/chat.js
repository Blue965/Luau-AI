export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages, model = 'anthropic/claude-3-haiku' } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages array required' });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    // Add system message
    const systemMessage = {
      role: 'system',
      content: 'You are Luau AI, an expert AI assistant for Roblox Studio scripting in the Luau programming language. Help users create high-quality Luau scripts, fix bugs, optimize performance, and provide guidance on Roblox game development. Always provide accurate, helpful, and safe code examples. Respond in French if the user asks in French.'
    };

    const fullMessages = [systemMessage, ...messages.map(m => ({
      role: m.role,
      content: m.text
    }))];

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.VERCEL_URL || 'http://localhost:3000',
        'X-Title': 'Luau AI'
      },
      body: JSON.stringify({
        model: model,
        messages: fullMessages,
        max_tokens: 2000,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenRouter API error:', error);
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