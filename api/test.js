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
  const apiKey = loadEnvKey('HUGGINGFACE_API_KEY') || loadEnvKey('HF_API_KEY');
 
  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: 'Clé API manquante.',
      fix: 'Ajoute HUGGINGFACE_API_KEY=hf_xxxx dans Vercel > Settings > Environment Variables'
    });
  }
 
  const model = loadEnvKey('HF_MODEL') || 'meta-llama/Llama-3.1-8B-Instruct';
 
  console.log('Test API — model:', model, '| key starts with:', apiKey.substring(0, 8) + '...');
 
  try {
    const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Dis juste "OK" en un mot.' }],
        max_tokens: 10,
        temperature: 0.1
      })
    });
 
    const body = await response.text();
 
    if (!response.ok) {
      let fix = '';
      if (response.status === 401) fix = 'Clé API invalide. Régénère-la sur huggingface.co/settings/tokens';
      if (response.status === 403) fix = 'Modèle gated : accepte les conditions sur huggingface.co/' + model;
      if (response.status === 404) fix = 'Modèle introuvable. Change HF_MODEL dans ton .env Vercel.';
      if (response.status === 503) fix = 'Modèle en cold start, réessaie dans 20s.';
 
      return res.status(response.status).json({
        success: false,
        status: response.status,
        model,
        error: body,
        fix: fix || 'Voir logs Vercel pour détails.'
      });
    }
 
    const data = JSON.parse(body);
    const reply = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || '?';
 
    return res.status(200).json({
      success: true,
      model,
      reply: reply.trim(),
      message: '✅ Clé API valide et modèle opérationnel !'
    });
 
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'Erreur réseau : ' + err.message
    });
  }
}