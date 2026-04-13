import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Hugging Face fallbacks (OpenAI-compatible router)
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
  "openai/gpt-4o-mini",
  "google/gemma-2-9b-it:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "meta-llama/llama-3.2-3b-instruct:free",
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

/**
 * Stream OpenAI-compatible chat completions (Groq, OpenRouter, Hugging Face router).
 */
async function streamChatCompletions(url, apiKey, model, messages, extraHeaders, res) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

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
        temperature: 0.55,
        top_p: 0.9,
        max_tokens: 2048,
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

  const systemPrompt = `Tu es Luau AI, assistant expert Roblox Studio et langage Luau.

Langue : réponds en français naturel et clair.

Ton et emojis : tu peux utiliser des emojis avec parcimonie dans tes messages pour être chaleureux et lisible (jamais à la place d’explications techniques).

Code :
- fournis du code Luau uniquement quand c’est utile ;
- blocs toujours en markdown avec le fence \`\`\`lua ;
- code compatible avec les APIs Roblox documentées, sans inventer de services ou propriétés.

Objectif : réponses précises, actionnables, orientées Studio (scripts serveur/client, RemoteEvents, performance, UI, débogage).`;

  const chatMessages = [{ role: "system", content: systemPrompt }];

  for (const m of messages) {
    const role =
      m.role === "assistant" || m.role === "ai" ? "assistant" : "user";

    const text = (m.text || "").trim();
    if (!text && !m.imageBase64) continue;

    if (m.imageBase64 && role === "user") {
      const base64 = m.imageBase64.replace(/^data:[^;]+;base64,/, "");

      chatMessages.push({
        role,
        content: [
          {
            type: "image_url",
            image_url: {
              url: `data:${m.imageMime};base64,${base64}`,
            },
          },
          {
            type: "text",
            text: text || "Analyse cette image Roblox",
          },
        ],
      });
    } else {
      chatMessages.push({
        role,
        content: text,
      });
    }
  }

  const tryOrder = [];

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
    const site = loadEnvKey("OPENROUTER_SITE_URL") || "https://luau-ai.local";
    tryOrder.push({
      name: "openrouter",
      url: "https://openrouter.ai/api/v1/chat/completions",
      key: openrouterKey,
      models: uniqueModels(
        [primary, ...OPENROUTER_FALLBACK_MODELS].filter(Boolean)
      ),
      extraHeaders: {
        "HTTP-Referer": site,
        "X-Title": "Luau AI",
      },
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

  for (const provider of tryOrder) {
    for (const model of provider.models) {
      if (!model) continue;
      console.log("TRY", provider.name, model);
      const ok = await streamChatCompletions(
        provider.url,
        provider.key,
        model,
        chatMessages,
        provider.extraHeaders,
        res
      );
      if (ok) {
        console.log("OK", provider.name, model);
        return;
      }
    }
  }

  return res.status(500).json({
    error: "Tous les modèles ont échoué. Vérifie ta clé API et les quotas (Groq / OpenRouter / Hugging Face).",
  });
}
