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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages array required' });
  }

  const apiKey = loadEnvKey('HUGGINGFACE_API_KEY') || loadEnvKey('HF_API_KEY');
  if (!apiKey) {
    console.error('Hugging Face API key not found');
    return res.status(500).json({
      error: 'API key not configured. Configure HUGGINGFACE_API_KEY or HF_API_KEY in environment or .env.'
    });
  }

  const model = loadEnvKey('HF_MODEL') || 'Roblox-Coder-Llama-7B-v1';

  console.log('=== DEBUG API CALL ===');
  console.log('Received messages:', JSON.stringify(messages, null, 2));
  console.log('API Key exists:', !!apiKey);
  console.log('Using model:', model);

  const systemMessage = {
    role: 'system',
    content: 'Tu es Luau AI, un assistant IA expert en scripting Roblox avec le langage Luau. Tu aides les utilisateurs à créer des scripts, déboguer du code, optimiser les performances et fournir des conseils sur le développement Roblox. Réponds toujours en français de manière claire et utile. Fournis des exemples de code précis et fonctionnels.'
  };

  const chatMessages = [
    systemMessage,
    ...messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.text
    }))
  ];

  function extractReply(data) {
    if (!data) return undefined;
    if (typeof data.choices?.[0]?.message?.content === 'string') return data.choices[0].message.content;
    if (typeof data.choices?.[0]?.text === 'string') return data.choices[0].text;
    if (typeof data.generated_text === 'string') return data.generated_text;
    if (Array.isArray(data) && typeof data[0]?.generated_text === 'string') return data[0].generated_text;
    return undefined;
  }

  async function callTextFallback(prompt) {
    console.log('Trying text fallback for model:', model);
    const fallbackResponse = await fetch(`https://api-inference.huggingface.co/models/${encodeURIComponent(model)}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: 600,
          temperature: 0.7,
          return_full_text: false
        }
      })
    });

    if (!fallbackResponse.ok) {
      const fallbackErr = await fallbackResponse.text();
      console.error('Text fallback failed:', fallbackResponse.status, fallbackErr);
      throw new Error(`Fallback text completion failed: ${fallbackResponse.status} ${fallbackErr}`);
    }

    const fallbackData = await fallbackResponse.json();
    console.log('Text fallback response:', JSON.stringify(fallbackData, null, 2));
    const fallbackText = extractReply(fallbackData);
    if (!fallbackText) {
      throw new Error('No answer from text fallback');
    }
    return fallbackText;
  }

  try {
    const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: chatMessages,
        max_tokens: 2000,
        temperature: 0.7
      })
    });

    console.log('Response status:', response.status);

    const data = await response.json();
    console.log('Success response:', JSON.stringify(data, null, 2));

    let reply = extractReply(data);
    if (!reply) {
      const prompt = chatMessages.map(m => `${m.role === 'system' ? 'System' : m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n') + '\nAssistant:';
      reply = await callTextFallback(prompt);
    }

    console.log('Final reply:', reply?.substring(0, 100) + '...');
    res.status(200).json({ reply });
  } catch (error) {
    console.error('Error calling Hugging Face:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}