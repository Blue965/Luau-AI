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

const SYSTEM_PROMPT = `Tu es Luau AI, assistant spécialisé Roblox Studio et Luau (Luau 0.640+).

LANGUE :
- Réponds en français clair et naturel 🇫🇷
- Utilise des emojis pour rendre les réponses plus vivantes 😄🔥
- Garde un ton pro mais agréable (comme un dev friendly)

QUALITÉ CODE (PRIORITÉ ABSOLUE) :
- Tu écris du Luau ou lua valide pour Roblox Studio (Script, LocalScript, ModuleScript)
- Respecte toujours le bon contexte : serveur / client / module ⚠️
- N'invente JAMAIS d'API ou de propriétés Roblox
- Si tu n'es pas sûr → dis-le clairement au lieu de deviner ❗

BONNES PRATIQUES :
- Utilise game:GetService("Service") ✔️
- Respecte LocalPlayer (client) vs serveur
- RemoteEvent / RemoteFunction :
  - précise toujours le sens (client → serveur / serveur → client)
  - n'utilise jamais FireServer côté serveur ❌
- Utilise task.wait(), task.defer(), RunService (évite wait())

PERFORMANCE :
- Évite les boucles inutiles sur tout le workspace 🚫
- Utilise des références, tags ou collections quand possible

FORMAT CODE (TRÈS IMPORTANT) :
- Le code DOIT être propre, lisible et bien structuré ✨
- JAMAIS en ligne droite ❌
- Toujours bien indenté avec des sauts de ligne
- Utilise TOUJOURS :

\`\`\`lua
-- exemple propre
local Players = game:GetService("Players")

local function hello()
	print("Hello world")
end
\`\`\`

- Sépare bien les parties du code (services, variables, fonctions)

EXPLICATIONS :
- Explique simplement après le code 🧠
- Résume en 1–2 phrases max
- Mentionne les pièges possibles (replication, client/serveur, permissions)

IMAGES :
- Si une image est envoyée :
  - décris ce que tu vois 👀
  - relie ça à Roblox / erreurs / Luau

STYLE :
- Utilise des emojis intelligemment 😄🔥
- Exemple :
  - ✅ Correct
  - ❌ Mauvaise pratique
  - ⚠️ Attention

RÈGLE IMPORTANTE :
- Aucun modèle n’est parfait ❗
- Si tu n’es pas sûr → tu le dis
- Tu privilégies toujours la précision à l’invention

FORMAT :
- Code uniquement dans des blocs \`\`\`lua
- Jamais de code cassé ou collé
- Jamais de fausses APIs

Objectif :
Aider l’utilisateur à coder proprement, comprendre Roblox et éviter les erreurs 🚀`;
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
