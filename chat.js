import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// =============================================
// MODELS 🔥 (ordre optimisé)
// =============================================
const FALLBACK_MODELS = [
  'HuggingFaceH4/zephyr-7b-beta',
  'mistralai/Mistral-7B-Instruct-v0.3',
  'Qwen/Qwen2.5-Coder-7B-Instruct',
  'microsoft/Phi-3.5-mini-instruct',
];

// =============================================
// ENV LOADER
// =============================================
function loadEnvKey(key) {
  if (process.env[key]) return process.env[key];

  const files = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env'),
  ];

  for (const file of files) {
    try {
      if (!fs.existsSync(file)) continue;

      const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);

      for (const line of lines) {
        const l = line.trim();
        if (!l || l.startsWith('#')) continue;

        const [name, ...rest] = l.split('=');
        if (name.trim() !== key) continue;

        let value = rest.join('=').trim();
        if (/^["'].*["']$/.test(value)) value = value.slice(1, -1);

        process.env[key] = value;
        return value;
      }
    } catch (err) {
      console.error('ENV ERROR:', err.message);
    }
  }

  return null;
}

// =============================================
// STREAM CALL 🔥 (ChatGPT style)
// =============================================
async function streamModel(model, messages, apiKey, res) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const hfRes = await fetch('https://router.huggingface.co/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.9,
        max_tokens: 2000,
        stream: true
      })
    });

    if (!hfRes.ok) {
      const txt = await hfRes.text();
      throw new Error(txt);
    }

    // 🔥 HEADERS STREAM
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });

    const reader = hfRes.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });

      // renvoie brut au frontend
      res.write(`data: ${chunk}\n\n`);
    }

    res.write(`data: [DONE]\n\n`);
    res.end();

    return true;

  } catch (err) {
    console.warn('STREAM ERROR:', model, err.message);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

// =============================================
// MAIN HANDLER
// =============================================
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let { messages } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Messages requis' });
  }

  // 🔥 mémoire limitée (comme ChatGPT)
  messages = messages.slice(-15);

  const apiKey =
    loadEnvKey('HUGGINGFACE_API_KEY') ||
    loadEnvKey('HF_API_KEY');

  if (!apiKey) {
    return res.status(500).json({
      error: 'Ajoute HUGGINGFACE_API_KEY'
    });
  }

  const envModel = loadEnvKey('HF_MODEL');
  const primaryModel = envModel || FALLBACK_MODELS[0];

  const models = [
    primaryModel,
    ...FALLBACK_MODELS.filter(m => m !== primaryModel)
  ];

  // =============================================
  // SYSTEM PROMPT 😎🔥
  // =============================================
  const systemPrompt = `
Tu es Luau AI 😎🔥

Expert Roblox Studio + Luau.

STYLE:
- Français
- Naturel
- Utilise emojis 😄🔥💡
- Réponses claires

CODE:
- Toujours entre \`\`\`lua
- Propre et optimisé

MISSION:
- aider
- debug
- optimiser
`;

  // =============================================
  // BUILD MESSAGES
  // =============================================
  const chatMessages = [
    { role: 'system', content: systemPrompt }
  ];

  for (const m of messages) {
    const role = m.role === 'assistant' ? 'assistant' : 'user';

    if (m.imageBase64 && role === 'user') {
      const base64 = m.imageBase64.replace(/^data:[^;]+;base64,/, '');

      chatMessages.push({
        role,
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:${m.imageMime};base64,${base64}`
            }
          },
          {
            type: 'text',
            text: m.text || 'Analyse cette image Roblox'
          }
        ]
      });
    } else {
      chatMessages.push({
        role,
        content: m.text || ''
      });
    }
  }

  // =============================================
  // FALLBACK STREAM 🔥
  // =============================================
  for (const model of models) {
    console.log('TRY STREAM:', model);

    const success = await streamModel(model, chatMessages, apiKey, res);

    if (success) {
      console.log('SUCCESS:', model);
      return;
    }
  }

  // ❌ si tout fail
  return res.status(500).json({
    error: 'Tous les modèles ont échoué'
  });
}