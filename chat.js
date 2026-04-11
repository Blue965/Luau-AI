import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const FALLBACK_MODELS = [
  'mistralai/Mistral-7B-Instruct-v0.3',
  'HuggingFaceH4/zephyr-7b-beta',
  'Qwen/Qwen2.5-Coder-7B-Instruct',
  'microsoft/Phi-3.5-mini-instruct',
];

function loadEnvKey(key) {
  if (process.env[key]) return process.env[key];
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env'),
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
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
        process.env[key] = value;
        return value;
      }
    } catch (err) { console.error('loadEnvKey error', err.message); }
  }
  return undefined;
}

async function callModel(model, chatMessages, apiKey) {
  const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: chatMessages, max_tokens: 2000, temperature: 0.7, stream: false }),
  });
  const rawText = await response.text();
  if (!response.ok) return { ok: false, status: response.status, body: rawText };
  let data;
  try { data = JSON.parse(rawText); } catch { return { ok: false, status: 200, body: 'Invalid JSON: ' + rawText }; }
  const reply = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || (Array.isArray(data) ? data[0]?.generated_text : null) || data?.generated_text;
  if (!reply) return { ok: false, status: 200, body: 'Empty reply' };
  return { ok: true, reply, model };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages } = req.body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) return res.status(400).json({ error: 'Messages required' });

  const apiKey = loadEnvKey('HUGGINGFACE_API_KEY') || loadEnvKey('HF_API_KEY');
  if (!apiKey) return res.status(500).json({ error: 'Cle API manquante. Ajoute HUGGINGFACE_API_KEY dans Vercel.' });

  const envModel = loadEnvKey('HF_MODEL');
  const invalidModels = ['Roblox-Coder-Llama-7B-v1', '', undefined];
  const primaryModel = envModel && !invalidModels.includes(envModel?.trim()) ? envModel.trim() : FALLBACK_MODELS[0];
  const modelsToTry = [primaryModel, ...FALLBACK_MODELS.filter(m => m !== primaryModel)];

  const systemPrompt = 'Tu es Luau AI, un assistant IA expert en scripting Roblox avec le langage Luau. ' +
    'Tu aides les utilisateurs a creer des scripts, debugger du code, optimiser les performances et fournir des conseils sur le developpement Roblox Studio. ' +
    'Reponds toujours en francais de maniere claire et utile. ' +
    'Quand tu fournis du code Luau, formate-le TOUJOURS entre ```lua et ``` avec des sauts de ligne corrects. ' +
    'Si une image est jointe, analyse-la et reponds en consequence. ' +
    'Ne genere jamais d\'images toi-meme.';

  // Build chat messages — handle images if present
  const chatMessages = [{ role: 'system', content: systemPrompt }];
  
  for (const m of messages) {
    const role = m.role === 'user' ? 'user' : 'assistant';
    
    // If message has an image, build multipart content
    if (m.imageBase64 && m.imageMime && role === 'user') {
      // Extract base64 data (remove data:image/xxx;base64, prefix)
      const base64Data = m.imageBase64.replace(/^data:[^;]+;base64,/, '');
      chatMessages.push({
        role,
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:${m.imageMime};base64,${base64Data}` }
          },
          {
            type: 'text',
            text: m.text || 'Analyse cette image et aide-moi avec mon projet Roblox.'
          }
        ]
      });
    } else {
      chatMessages.push({ role, content: String(m.text || '') });
    }
  }

  let lastError = null;
  for (const model of modelsToTry) {
    console.log('Trying model:', model);
    const result = await callModel(model, chatMessages, apiKey);
    if (result.ok) {
      console.log('Success:', result.model);
      return res.status(200).json({ reply: result.reply, model: result.model });
    }
    console.warn('Failed:', model, result.status, result.body?.substring(0, 150));
    lastError = { status: result.status, body: result.body, model };
    if (result.status === 401) return res.status(401).json({ error: 'Cle API invalide (401). Regenere-la sur huggingface.co/settings/tokens.' });
    if (result.status === 429) return res.status(429).json({ error: 'Limite de requetes (429). Reessaie dans quelques secondes.' });
  }

  return res.status(500).json({ error: `Tous les modeles indisponibles. Code: ${lastError?.status}`, debug: lastError });
}