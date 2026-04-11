
Copier

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
      console.error('Error loading .env from', candidate, err);
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
      error: 'Clé API manquante. Configure HUGGINGFACE_API_KEY dans les variables d\'environnement Vercel.'
    });
  }
 
  // -------------------------------------------------------
  // Modèle par défaut : meta-llama/Llama-3.1-8B-Instruct
  // Tu peux changer dans ton .env : HF_MODEL=mistralai/Mixtral-8x7B-Instruct-v0.1
  // Autres modèles compatibles router HF :
  //   - meta-llama/Llama-3.2-3B-Instruct  (plus léger/rapide)
  //   - mistralai/Mistral-7B-Instruct-v0.3
  //   - Qwen/Qwen2.5-Coder-7B-Instruct    (spécialisé code !)
  // -------------------------------------------------------
  const model = loadEnvKey('HF_MODEL') || 'meta-llama/Llama-3.1-8B-Instruct';
 
  console.log('=== LUAU AI CHAT ===');
  console.log('Model:', model);
  console.log('Messages count:', messages.length);
 
  const chatMessages = [
    {
      role: 'system',
      content:
        'Tu es Luau AI, un assistant IA expert en scripting Roblox avec le langage Luau. ' +
        'Tu aides les utilisateurs à créer des scripts, déboguer du code, optimiser les performances ' +
        'et fournir des conseils sur le développement Roblox Studio. ' +
        'Réponds toujours en français de manière claire et utile. ' +
        'Fournis des exemples de code Luau précis et fonctionnels quand pertinent. ' +
        'Formate le code entre balises ```luau et ```.'
    },
    ...messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.text
    }))
  ];
 
  // -------------------------------------------------------
  // UN SEUL endpoint : router.huggingface.co (OpenAI-compatible)
  // L'ancien api-inference.huggingface.co est supprimé (410)
  // -------------------------------------------------------
  const ROUTER_URL = 'https://router.huggingface.co/v1/chat/completions';
 
  try {
    console.log('Calling HuggingFace Router:', ROUTER_URL);
 
    const response = await fetch(ROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: chatMessages,
        max_tokens: 2000,
        temperature: 0.7,
        stream: false
      })
    });
 
    console.log('HF Router status:', response.status);
 
    if (!response.ok) {
      const errText = await response.text();
      console.error('HF Router error:', response.status, errText);
 
      // Message d'erreur lisible selon le code HTTP
      let userMsg = `Erreur du modèle IA (${response.status}).`;
      if (response.status === 401) {
        userMsg = 'Clé API HuggingFace invalide. Vérifie HUGGINGFACE_API_KEY dans Vercel.';
      } else if (response.status === 403) {
        userMsg = 'Accès refusé au modèle. Vérifie que tu as accepté les conditions sur huggingface.co/settings/gated-repos';
      } else if (response.status === 404) {
        userMsg = `Modèle "${model}" introuvable sur HuggingFace Router. Change HF_MODEL dans ton .env.`;
      } else if (response.status === 429) {
        userMsg = 'Limite de requêtes atteinte. Réessaie dans quelques secondes.';
      } else if (response.status === 503) {
        userMsg = 'Modèle en cours de chargement sur HuggingFace. Réessaie dans 20 secondes.';
      }
 
      return res.status(response.status).json({ error: userMsg, details: errText });
    }
 
    const data = await response.json();
    console.log('HF Router raw response keys:', Object.keys(data));
 
    // Extraire la réponse (format OpenAI standard)
    const reply =
      data?.choices?.[0]?.message?.content ||
      data?.choices?.[0]?.text ||
      data?.generated_text ||
      (Array.isArray(data) ? data[0]?.generated_text : null);
 
    if (!reply) {
      console.error('No reply extracted. Full response:', JSON.stringify(data));
      return res.status(500).json({
        error: 'Aucune réponse du modèle IA. Réponse inattendue.',
        raw: data
      });
    }
 
    console.log('Reply extracted (first 100 chars):', reply.substring(0, 100));
    return res.status(200).json({ reply });
 
  } catch (error) {
    console.error('Fetch error calling HF Router:', error);
    return res.status(500).json({
      error: 'Erreur réseau : ' + (error.message || 'Impossible de contacter HuggingFace.')
    });
  }
}
 