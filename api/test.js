import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

function loadEnvKey(key) {
  if (process.env[key]) return process.env[key];

  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env')
  ];

  for (const candidate of candidates) {
    console.log('loadEnvKey candidate', candidate);
    try {
      if (!fs.existsSync(candidate)) {
        console.log('loadEnvKey missing file', candidate);
        continue;
      }
      console.log('loadEnvKey found file', candidate);
      const text = fs.readFileSync(candidate, 'utf8');
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
      console.error('Error loading .env file from', candidate, err);
    }
  }

  return undefined;
}

export default async function handler(req, res) {
  const apiKey = loadEnvKey('HUGGINGFACE_API_KEY') || loadEnvKey('HF_API_KEY');
  if (!apiKey) {
    return res.status(500).json({
      error: 'API key not configured. Configure HUGGINGFACE_API_KEY or HF_API_KEY in environment or .env.'
    });
  }

  const model = loadEnvKey('HF_MODEL') || 'Roblox-Coder-Llama-7B-v1';

  try {
    // Test simple avec le routeur Hugging Face OpenAI-compatible
    const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'user', content: 'Salut' }
        ],
        max_tokens: 100,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const error = await response.text();
      return res.status(response.status).json({
        error: 'API test failed',
        status: response.status,
        details: error
      });
    }

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || data?.generated_text;
    res.status(200).json({
      success: true,
      message: 'API key is valid',
      model,
      reply: reply ? reply.substring(0, 100) + '...' : 'Pas de réponse de test détectée'
    });
  } catch (error) {
    res.status(500).json({ error: 'Test failed: ' + error.message });
  }
}