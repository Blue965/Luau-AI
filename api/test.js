import fs from 'fs';

function loadEnvKey(key) {
  if (process.env[key]) return process.env[key];
  try {
    const envPath = new URL('../.env', import.meta.url);
    if (!fs.existsSync(envPath)) return undefined;
    const text = fs.readFileSync(envPath, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [name, ...rest] = trimmed.split('=');
      if (name.trim() !== key) continue;
      let value = rest.join('=').trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
      return value;
    }
  } catch (err) {
    console.error('Error loading .env file:', err);
  }
  return undefined;
}

export default async function handler(req, res) {
  const apiKey = loadEnvKey('HUGGINGFACE_API_KEY');
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