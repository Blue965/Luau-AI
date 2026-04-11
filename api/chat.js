import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
 
// ─────────────────────────────────────────────
// Modèles de fallback (du meilleur au plus léger)
// Tous sont GRATUITS et non-gated sur HF Router
// ─────────────────────────────────────────────
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
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        process.env[key] = value;
        return value;
      }
    } catch (err) {
      console.error('loadEnvKey error for', candidate, err.message);
    }
  }
  return undefined;
}
 
async function callModel(model, chatMessages, apiKey) {
  const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: chatMessages,
      max_tokens: 2000,
      temperature: 0.7,
      stream: false,
    }),
  });
 
  const rawText = await response.text();
 
  if (!response.ok) {
    return { ok: false, status: response.status, body: rawText };
  }
 
  let data;
  try {
    data = JSON.parse(rawText);
  } catch {
    return { ok: false, status: 200, body: 'Invalid JSON: ' + rawText };
  }
 
  const reply =
    data?.choices?.[0]?.message?.content ||
    data?.choices?.[0]?.text ||
    (Array.isArray(data) ? data[0]?.generated_text : null) ||
    data?.generated_text;
 
  if (!reply) {
    return { ok: false, status: 200, body: 'Empty reply. Raw: ' + rawText };
  }
 
  return { ok: true, reply, model };
}
 
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
 
  const { messages } = req.body;
 
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Messages array required and must not be empty.' });
  }
 
  const apiKey = loadEnvKey('HUGGINGFACE_API_KEY') || loadEnvKey('HF_API_KEY');
 
  if (!apiKey) {
    console.error('No HuggingFace API key found');
    return res.status(500).json({
      error: 'Cle API manquante. Dans Vercel > Settings > Environment Variables, ajoute : HUGGINGFACE_API_KEY = hf_xxxx',
    });
  }
 
  // Modèle depuis .env, sinon premier fallback
  // On ignore l'ancien nom invalide
  const envModel = loadEnvKey('HF_MODEL');
  const invalidModels = ['Roblox-Coder-Llama-7B-v1', '', undefined];
  const primaryModel =
    envModel && !invalidModels.includes(envModel.trim())
      ? envModel.trim()
      : FALLBACK_MODELS[0];
 
  const modelsToTry = [primaryModel, ...FALLBACK_MODELS.filter((m) => m !== primaryModel)];
 
  console.log('=== LUAU AI CHAT ===');
  console.log('Messages count:', messages.length);
  console.log('Models to try:', modelsToTry);
 
  const chatMessages = [
    {
      role: 'system',
      content:
        'Tu es Luau AI, un assistant IA expert en scripting Roblox avec le langage Luau. ' +
        'Tu aides les utilisateurs a creer des scripts, debugger du code, optimiser les performances ' +
        'et fournir des conseils sur le developpement Roblox Studio. ' +
        'Reponds toujours en francais de maniere claire et utile. ' +
        'Formate le code Luau entre balises ```luau et ```. ' +
        "Va droit au but sans introduction inutile.",
    },
    ...messages.map((m) => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: String(m.text || ''),
    })),
  ];
 
  let lastError = null;
 
  for (const model of modelsToTry) {
    console.log('Trying model:', model);
    const result = await callModel(model, chatMessages, apiKey);
 
    if (result.ok) {
      console.log('Success with model:', result.model);
      return res.status(200).json({ reply: result.reply, model: result.model });
    }
 
    console.warn('Model', model, 'failed:', result.status, result.body?.substring(0, 200));
    lastError = { status: result.status, body: result.body, model };
 
    // Clé invalide -> inutile d'essayer les autres
    if (result.status === 401) {
      return res.status(401).json({
        error: 'Cle API HuggingFace invalide (401). Regenere-la sur huggingface.co/settings/tokens et mets-la a jour dans Vercel.',
      });
    }
 
    // Rate limit -> inutile d'essayer les autres
    if (result.status === 429) {
      return res.status(429).json({
        error: 'Limite de requetes HuggingFace atteinte (429). Reessaie dans quelques secondes.',
      });
    }
 
    // 403 / 404 / 503 -> on essaie le modele suivant
  }
 
  // Tous les modèles ont échoué
  console.error('All models failed. Last error:', lastError);
 
  let userMsg = `Tous les modeles IA sont indisponibles. Code: ${lastError?.status}`;
  if (lastError?.status === 403) {
    userMsg =
      'Acces refuse (403). Va sur huggingface.co/settings/gated-repos et accepte les conditions.';
  }
 
  return res.status(500).json({ error: userMsg, debug: lastError });
}
 