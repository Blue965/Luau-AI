export default async function handler(req, res) {
  const apiKey = process.env.HUGGINGFACE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    // Test simple avec le routeur Hugging Face OpenAI-compatible
    const response = await fetch(
      'https://router.huggingface.co/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'openai/gpt-oss-120b:fastest',
          messages: [
            { role: 'user', content: 'Salut' }
          ],
          max_tokens: 100,
          temperature: 0.7
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      return res.status(response.status).json({
        error: 'API test failed',
        status: response.status,
        details: error
      });
    }

    const data = await response.json();
    res.status(200).json({
      success: true,
      message: 'API key is valid',
      reply: data?.choices?.[0]?.message?.content?.substring(0, 50) + '...'
    });
  } catch (error) {
    res.status(500).json({ error: 'Test failed: ' + error.message });
  }
}