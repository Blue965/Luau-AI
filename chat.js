import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// =============================================
// MODELS
// =============================================
const FALLBACK_MODELS = [
  'Qwen/Qwen2.5-Coder-7B-Instruct',
  'HuggingFaceH4/zephyr-7b-beta',
  'mistralai/Mistral-7B-Instruct-v0.3',
  'microsoft/Phi-3.5-mini-instruct',
];

// =============================================
// ENV LOADER
// =============================================
function loadEnvKey(key) {
  if (process.env[key]) return process.env[key];

  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env'),
  ];

  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;

      const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const [name, ...rest] = trimmed.split('=');
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

  return undefined;
}

// =============================================
// CALL MODEL (WITH TIMEOUT 🔥)
// =============================================
async function callModel(model, messages, apiKey) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch('https://router.huggingface.co/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 2000,
        temperature: 0.9, // 🔥 plus fun + emojis
      })
    });

    const text = await res.text();
    if (!res.ok) return { ok: false, status: res.status, body: text };

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return { ok: false, status: 200, body: 'Invalid JSON' };
    }

    const reply =
      data?.choices?.[0]?.message?.content ||
      data?.choices?.[0]?.text ||
      data?.generated_text;

    if (!reply) return { ok: false, status: 200, body: 'Empty reply' };

    return { ok: true, reply, model };

  } catch (err) {
    return { ok: false, status: 500, body: err.message };
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

  // 🔥 limite mémoire
  messages = messages.slice(-15);

  const apiKey =
    loadEnvKey('HUGGINGFACE_API_KEY') ||
    loadEnvKey('HF_API_KEY');

  if (!apiKey) {
    return res.status(500).json({
      error: 'Ajoute HUGGINGFACE_API_KEY dans Vercel'
    });
  }

  const envModel = loadEnvKey('HF_MODEL');
  const primaryModel = envModel || FALLBACK_MODELS[0];

  const models = [
    primaryModel,
    ...FALLBACK_MODELS.filter(m => m !== primaryModel)
  ];

  // =============================================
  // SYSTEM PROMPT (🔥 EMOJIS FORCÉS)
  // =============================================
  const systemPrompt = `
Tu es Luau AI 😎🔥

Tu es un assistant expert Roblox Studio + Luau.

STYLE OBLIGATOIRE:
- Réponds en français
- Utilise des emojis 😄🔥💡
- Sois naturel et cool
- Explique clairement

CODE:
- Toujours entre \`\`\`lua
- Code propre et optimisé

MISSION:
- aider à coder
- debug
- optimiser
- expliquer simplement
`;

  // =============================================
  // BUILD MESSAGES
  // =============================================
  const chatMessages = [{ role: 'system', content: systemPrompt }];

  for (const m of messages) {
    const role = m.role === 'assistant' ? 'assistant' : 'user';

    if (m.imageBase64 && m.imageMime && role === 'user') {
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
        content: "Réponds avec des emojis 😄🔥 : " + (m.text || '')
      });
    }
  }

  // =============================================
  // FALLBACK SYSTEM
  // =============================================
  let lastError = null;

  for (const model of models) {
    console.log('TRY:', model);

    const result = await callModel(model, chatMessages, apiKey);

    if (result.ok) {
      console.log('SUCCESS:', result.model);

      return res.status(200).json({
        reply: result.reply,
        model: result.model
      });
    }

    console.warn('FAIL:', model, result.status);
    lastError = result;

    if (result.status === 401) {
      return res.status(401).json({ error: 'API key invalide' });
    }

    if (result.status === 429) {
      return res.status(429).json({ error: 'Rate limit atteint' });
    }
  }

  return res.status(500).json({
    error: 'Tous les modèles ont échoué',
    debug: lastError
  });
}