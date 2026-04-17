import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const HF_FALLBACK_MODELS = [
  "HuggingFaceH4/zephyr-7b-beta",
  "mistralai/Mistral-7B-Instruct-v0.3",
  "Qwen/Qwen2.5-Coder-7B-Instruct",
  "microsoft/Phi-3.5-mini-instruct",
];

const GROQ_FALLBACK_MODELS = [
  "openai/gpt-oss-120b",
  "llama-3.3-70b-versatile",
  "qwen/qwen3-32b",
  "openai/gpt-oss-20b",
  "llama-3.1-8b-instant",
];

const OPENROUTER_FALLBACK_MODELS = [
  "anthropic/claude-3.5-sonnet",
  "anthropic/claude-3-opus",
  "openai/gpt-4o-mini",
];

/** Modèles capables vision (images) — Groq */
const GROQ_VISION_FALLBACK_MODELS = [
  "meta-llama/llama-4-scout-17b-16e-instruct",
];

/** Modèles vision — OpenRouter */
const OPENROUTER_VISION_FALLBACK_MODELS = [
  "openai/gpt-4o-mini",
  "meta-llama/llama-3.2-11b-vision-instruct:free",
];

function loadEnvKey(key) {
  if (process.env[key]) return process.env[key];

  const files = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      ".env"
    ),
  ];

  for (const file of files) {
    try {
      if (!fs.existsSync(file)) continue;

      const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);

      for (const line of lines) {
        const l = line.trim();
        if (!l || l.startsWith("#")) continue;

        const [name, ...rest] = l.split("=");
        if (name.trim() !== key) continue;

        let value = rest.join("=").trim();
        if (/^["'].*["']$/.test(value)) value = value.slice(1, -1);

        process.env[key] = value;
        return value;
      }
    } catch (err) {
      console.error("ENV ERROR:", err.message);
    }
  }

  return null;
}

function uniqueModels(list) {
  const seen = new Set();
  const out = [];
  for (const m of list) {
    if (!m || seen.has(m)) continue;
    seen.add(m);
    out.push(m);
  }
  return out;
}

function normalizeImagesFromMessage(m) {
  const out = [];
  if (Array.isArray(m.images)) {
    for (const im of m.images) {
      if (!im || !im.base64) continue;
      const mime = im.mime || "image/png";
      const b64 = String(im.base64).replace(/^data:[^;]+;base64,/, "");
      out.push({ mime, b64 });
    }
  }
  if (m.imageBase64) {
    const b64 = String(m.imageBase64).replace(/^data:[^;]+;base64,/, "");
    out.push({
      mime: m.imageMime || "image/png",
      b64,
    });
  }
  return out;
}

function messagesHaveVision(messages) {
  if (!Array.isArray(messages)) return false;
  return messages.some((m) => normalizeImagesFromMessage(m).length > 0);
}

const SYSTEM_PROMPT = `
Tu es Luau AI, un assistant senior expert Roblox Studio et Luau (niveau développeur professionnel).

────────────────────────
🧠 RÔLE PRINCIPAL
────────────────────────
Tu agis comme un développeur Roblox senior :
- Tu codes comme un humain expert (pas comme un générateur naïf)
- Tu privilégies la stabilité, la logique et les bonnes pratiques
- Tu évites toute invention d’API ou de comportement Roblox

────────────────────────
🌍 LANGUE & COMMUNICATION
────────────────────────
- Français clair et naturel 🇫🇷
- Ton professionnel, comme un dev senior
- Explications courtes, précises, utiles
- Pas de blabla inutile

────────────────────────
🧠 FIABILITÉ (TRÈS IMPORTANT)
────────────────────────
- Tu ne dois JAMAIS inventer une API Roblox ❌
- Tu ne dois JAMAIS inventer une propriété ou méthode ❌
- Si une information est incertaine → tu le dis clairement ⚠️
- Tu privilégies toujours la précision technique
- Tu refuses de deviner

────────────────────────
🎮 ROBLOX RULESET STRICT
────────────────────────
- Respect strict client / serveur :
  - LocalScript = client uniquement
  - Script = serveur uniquement
  - ModuleScript = partagé
- game:GetService() obligatoire ✔️
- RemoteEvent :
  - FireServer = client uniquement
  - FireClient / FireAllClients = serveur uniquement
- RemoteFunction :
  - InvokeServer = client uniquement
  - OnServerInvoke = serveur uniquement
- Aucun usage d’API dépréciée ou non réelle

────────────────────────
⚙️ QUALITÉ CODE (NIVEAU PRO)
────────────────────────
- Code propre, structuré, maintenable
- Variables claires et nommées correctement
- Utilisation de task.wait / task.spawn / task.defer
- Pas de wait()
- Pas de boucles inutiles sur Workspace
- Optimisation mémoire et événements proprement connectés

────────────────────────
🖥️ UI / UX (NIVEAU PRO ROBLOX)
────────────────────────
- UI moderne inspirée jeux Roblox populaires (Blox Fruits, Pet Sim, Arsenal, steal a brainrot, etc.)
- Toujours :
  - UICorner obligatoire
  - UIStroke pour bordures
  - UIListLayout / UIPadding pour structure
- Design propre, aligné, espacé correctement
- Hiérarchie visuelle claire (titre / contenu / actions)

🎨 INTERACTIONS UI :
- Hover effects (MouseEnter / MouseLeave)
- Click feedback (TweenService)
- Animations fluides et légères

🚫 INTERDIT :
- UI basique non stylée
- Frames blanches sans design
- UI sans structure
- Boutons sans feedback

────────────────────────
💻 FORMAT DE CODE (OBLIGATOIRE)
────────────────────────
Toujours utiliser des blocs Lua propres :

\`\`\`lua
-- Services
local Players = game:GetService("Players")

-- Variables
local player = Players.LocalPlayer

-- Fonction propre
local function example()
	print("Hello")
end
\`\`\`

- Code toujours lisible et indenté
- Jamais de code sur une seule ligne illisible
- Jamais de code incomplet ou cassé volontairement

────────────────────────
🧩 COMPORTEMENT RÉFLEXIF (IMPORTANT)
────────────────────────
Avant de répondre :
1. Vérifie si l’API Roblox existe vraiment
2. Vérifie client / serveur
3. Vérifie logique du code
4. Si doute → proposer alternative sûre

────────────────────────
❌ INTERDICTIONS STRICTES
────────────────────────
- Pas de fausses APIs Roblox
- Pas de pseudo-code présenté comme réel
- Pas de réponses inventées
- Pas de confusion client/serveur
- Pas de code volontairement incorrect

────────────────────────
🎯 OBJECTIF FINAL
────────────────────────
Créer du code Roblox :
- fiable
- propre
- professionnel
- sans erreurs logiques
- proche d’un développeur humain senior
`;
async function streamChatCompletions(
  url,
  apiKey,
  model,
  messages,
  extraHeaders,
  res,
  opts = {}
) {
  const temperature = typeof opts.temperature === "number" ? opts.temperature : 0.42;
  const max_tokens = opts.max_tokens || 4096;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...extraHeaders,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages,
        temperature,
        top_p: 0.9,
        max_tokens,
        stream: true,
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const txt = await upstream.text().catch(() => "");
      throw new Error(txt || `HTTP ${upstream.status}`);
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const reader = upstream.body.getReader();
    let hasData = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      hasData = true;
      res.write(Buffer.from(value));
    }

    if (!hasData) throw new Error("Empty stream");

    res.write(`data: [DONE]\n\n`);
    res.end();
    return true;
  } catch (err) {
    console.warn("STREAM FAIL:", model, err.message);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function buildChatMessagesArray(reqMessages) {
  const chatMessages = [{ role: "system", content: SYSTEM_PROMPT }];

  for (const m of reqMessages) {
    const role =
      m.role === "assistant" || m.role === "ai" ? "assistant" : "user";

    const text = (m.text || "").trim();
    const imgs = normalizeImagesFromMessage(m);

    if (!text && imgs.length === 0) continue;

    if (role === "user" && imgs.length > 0) {
      const content = imgs.map((im) => ({
        type: "image_url",
        image_url: {
          url: `data:${im.mime};base64,${im.b64}`,
        },
      }));
      content.push({
        type: "text",
        text:
          text ||
          "Analyse cette image (capture Roblox Studio, erreur, UI, script). Réponds en français avec des conseils Luau précis.",
      });
      chatMessages.push({ role, content });
    } else {
      chatMessages.push({ role, content: text });
    }
  }

  return chatMessages;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let { messages } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "Messages requis" });
  }

  messages = messages.slice(-15);

  const groqKey = loadEnvKey("GROQ_API_KEY");
  const openrouterKey = loadEnvKey("OPENROUTER_API_KEY");
  const hfKey = loadEnvKey("HUGGINGFACE_API_KEY") || loadEnvKey("HF_API_KEY");

  if (!groqKey && !openrouterKey && !hfKey) {
    return res.status(500).json({
      error:
        "Aucune clé API configurée. Ajoute dans .env une des options gratuites : GROQ_API_KEY (groq.com), OPENROUTER_API_KEY (openrouter.ai, modèles :free), ou HUGGINGFACE_API_KEY.",
    });
  }

  const hasVision = messagesHaveVision(messages);
  const chatMessages = buildChatMessagesArray(messages);

  const site = loadEnvKey("OPENROUTER_SITE_URL") || "https://luau-ai.local";
  const orHeaders = {
    "HTTP-Referer": site,
    "X-Title": "Luau AI",
  };

  const tryOrder = [];

  if (hasVision) {
    const orVision = uniqueModels(
      [
        loadEnvKey("OPENROUTER_VISION_MODEL"),
        ...OPENROUTER_VISION_FALLBACK_MODELS,
      ].filter(Boolean)
    );
    const groqVision = uniqueModels(
      [loadEnvKey("GROQ_VISION_MODEL"), ...GROQ_VISION_FALLBACK_MODELS].filter(
        Boolean
      )
    );

    if (openrouterKey && orVision.length) {
      tryOrder.push({
        name: "openrouter-vision",
        url: "https://openrouter.ai/api/v1/chat/completions",
        key: openrouterKey,
        models: orVision,
        extraHeaders: orHeaders,
      });
    }
    if (groqKey && groqVision.length) {
      tryOrder.push({
        name: "groq-vision",
        url: "https://api.groq.com/openai/v1/chat/completions",
        key: groqKey,
        models: groqVision,
        extraHeaders: {},
      });
    }

    if (tryOrder.length === 0) {
      return res.status(400).json({
        error:
          "Les images nécessitent une clé Groq ou OpenRouter avec un modèle vision. Ajoute OPENROUTER_API_KEY ou GROQ_API_KEY, ou OPENROUTER_VISION_MODEL / GROQ_VISION_MODEL dans .env.",
      });
    }
  } else {
    if (groqKey) {
      const primary = loadEnvKey("GROQ_MODEL");
      tryOrder.push({
        name: "groq",
        url: "https://api.groq.com/openai/v1/chat/completions",
        key: groqKey,
        models: uniqueModels(
          [primary, ...GROQ_FALLBACK_MODELS].filter(Boolean)
        ),
        extraHeaders: {},
      });
    }

    if (openrouterKey) {
      const primary = loadEnvKey("OPENROUTER_MODEL");
      tryOrder.push({
        name: "openrouter",
        url: "https://openrouter.ai/api/v1/chat/completions",
        key: openrouterKey,
        models: uniqueModels(
          [primary, ...OPENROUTER_FALLBACK_MODELS].filter(Boolean)
        ),
        extraHeaders: orHeaders,
      });
    }

    if (hfKey) {
      const envModel = loadEnvKey("HF_MODEL");
      const primaryModel = envModel || HF_FALLBACK_MODELS[0];
      tryOrder.push({
        name: "huggingface",
        url: "https://router.huggingface.co/v1/chat/completions",
        key: hfKey,
        models: uniqueModels([
          primaryModel,
          ...HF_FALLBACK_MODELS.filter((m) => m !== primaryModel),
        ]),
        extraHeaders: {},
      });
    }
  }

  const streamOpts = { temperature: 0.42, max_tokens: 4096 };

  for (const provider of tryOrder) {
    for (const model of provider.models) {
      if (!model) continue;
      console.log("TRY", provider.name, model, hasVision ? "vision" : "text");
      const ok = await streamChatCompletions(
        provider.url,
        provider.key,
        model,
        chatMessages,
        provider.extraHeaders,
        res,
        streamOpts
      );
      if (ok) {
        console.log("OK", provider.name, model);
        return;
      }
    }
  }

  return res.status(500).json({
    error:
      "Tous les modèles ont échoué. Vérifie ta clé API, les quotas, et pour les images un modèle vision (GROQ_VISION_MODEL / OPENROUTER_VISION_MODEL).",
  });
}
