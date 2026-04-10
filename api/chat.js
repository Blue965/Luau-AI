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
    try {
      if (!fs.existsSync(candidate)) continue;
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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages array required' });
  }

  const apiKey = loadEnvKey('HUGGINGFACE_API_KEY');
  if (!apiKey) {
    console.error('HUGGINGFACE_API_KEY not found');
    return res.status(500).json({ error: 'API key not configured' });
  }

  console.log('=== DEBUG API CALL ===');
  console.log('Received messages:', JSON.stringify(messages, null, 2));
  console.log('API Key exists:', !!apiKey);
  console.log('API Key starts with:', apiKey.substring(0, 10) + '...');

  try {
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
            {
              role: 'system',
              content: 'Tu es Luau AI, un assistant IA expert en scripting Roblox avec le langage Luau. Tu aides les utilisateurs à créer des scripts, déboguer du code, optimiser les performances et fournir des conseils sur le développement Roblox. Réponds toujours en français de manière claire et utile. Fournis des exemples de code précis et fonctionnels.'
            },
            ...messages.map(m => ({
              role: m.role === 'user' ? 'user' : 'assistant',
              content: m.text
            }))
          ],
          max_tokens: 2000,
          temperature: 0.7
        })
      }
    );

    console.log('Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('=== API ERROR ===');
      console.error('Status:', response.status);
      console.error('Status Text:', response.statusText);
      console.error('Response Body:', errorText);
      console.error('================');
      return res.status(response.status).json({
        error: `AI service error: ${response.status} - ${errorText}`
      });
    }

    const data = await response.json();
    console.log('Success response:', JSON.stringify(data, null, 2));

    const reply = data?.choices?.[0]?.message?.content;

    if (!reply) {
      console.error('No reply in response');
      return res.status(500).json({ error: 'No response from AI' });
    }

    console.log('Final reply:', reply ? reply.substring(0, 100) + '...' : 'undefined');
    res.status(200).json({ reply });
  } catch (error) {
    console.error('Error calling Hugging Face:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}