/**
 * REFERENCE WORKER — ace-brain
 * --------------------------------
 * This file is NOT the script currently running at
 * https://ace-brain.jasonchadpillay-07.workers.dev
 * Nothing in this repository is deployed to Cloudflare by pushing or merging.
 *
 * The live Worker already answers GET with
 * {"status":"online","assistant":"ACE","brain":"Gemini"}
 * and POST {"message":"..."} with either {"reply":"..."} or
 * {"error":"...","details":"..."}.
 * On 27 Nov 2026 the first live POST returned HTTP 502 because Gemini said
 * the model was experiencing high demand. A later deploy of this script
 * answers again. The model list matches that deploy: two free-tier Flash-Lite
 * models, then gemini-3.8-flash if both are busy. The spoken persona is a
 * calm British gentleman. Deploying this file is a separate manual step.
 *
 * Deploy only when the owner chooses to replace the live script:
 *   cd worker
 *   npx wrangler login
 *   npx wrangler deploy
 *   npx wrangler secret put GEMINI_API_KEY
 *
 * The key is read from the Worker secret GEMINI_API_KEY only.
 * Long-term memory uses the KV binding ACE_MEMORY and the secret
 * ACE_MEMORY_TOKEN. Do not paste either secret into this file or git.
 */

const PAGES_ORIGIN = "https://jasonchad07.github.io";

const ALLOWED_ORIGINS = new Set([
  PAGES_ORIGIN,
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:8787",
  "http://127.0.0.1:8787",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
]);

import {
  TOKEN_HEADER,
  memoryAccess,
  memoryCommand,
  unavailableReply,
  listMemories,
  addMemory,
  updateMemory,
  deleteMemory,
  applyCommand,
  memoriesForPrompt,
  buildSystemPrompt,
} from "./memory.js";

const DEFAULT_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.8-flash"];
const GOOGLE_BASE = "https://generativelanguage.googleapis.com/v1beta";

export const SYSTEM_PROMPT = [
  "You are ACE, a calm, articulate and warm British gentleman who serves as a personal assistant.",
  "Use polished, natural British English. Stay composed and kind. Do not be theatrical, stiff, or comic.",
  "You may say brother occasionally, only when it sounds natural. Do not use it in every reply.",
  "Be concise. Help with planning, research, business ideas and task lists.",
  "South African rand amounts are normal.",
  "You cannot access email, banking, calendars, messages, or other devices.",
  "Never ask for, repeat, or store passwords, PINs, banking details, payment details, or verification codes.",
  "You may draft a message when asked, but never claim to have sent, published, or paid for anything.",
  "If you are not sure of a current fact, say so instead of inventing it.",
].join(" ");

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    try {
      const url = new URL(request.url);
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders(origin) });
      }
      if (url.pathname === "/memory" || url.pathname.startsWith("/memory/")) {
        return await handleMemory(request, env || {}, origin, url);
      }
      if (request.method === "GET") {
        return json({ status: "online", assistant: "ACE", brain: "Gemini" }, 200, origin);
      }
      if (request.method !== "POST") {
        return json({ error: "Method not allowed.", details: "Use POST with a JSON message." }, 405, origin);
      }
      return await handlePost(request, env || {}, origin);
    } catch (error) {
      return json({
        error: "ACE encountered a connection problem.",
        details: safeText(error && error.message, env && env.GEMINI_API_KEY),
      }, 500, origin);
    }
  },
};

async function handlePost(request, env, origin) {
  let body;
  try {
    body = await request.json();
  } catch (error) {
    return json({
      error: "ACE could not read that request.",
      details: "Send JSON like {\"message\":\"hello\"}.",
    }, 400, origin);
  }

  const message = body && typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return json({ error: "Please enter a message" }, 400, origin);
  }
  if (message.length > 4000) {
    return json({
      error: "That command is too long.",
      details: "Please send 4000 characters or fewer.",
    }, 400, origin);
  }

  const access = memoryAccess(env, request);
  const command = memoryCommand(message);
  if (command) {
    if (!access.ok) {
      return json({ reply: unavailableReply(access.reason), memory: "off" }, 200, origin);
    }
    const done = await applyCommand(env.ACE_MEMORY, command);
    return json({ reply: done.reply, memory: "on", saved: done.saved || null, deleted: done.deleted || null }, 200, origin);
  }

  const secret = typeof env.GEMINI_API_KEY === "string" ? env.GEMINI_API_KEY.trim() : "";
  if (!secret) {
    return json({
      error: "ACE brain is not configured.",
      details: "The GEMINI_API_KEY Worker secret is missing. Set it in Cloudflare. Do not put the key in the website or in git.",
    }, 500, origin);
  }

  let systemText = SYSTEM_PROMPT;
  let memoryState = "off";
  if (access.ok) {
    try {
      const memories = await memoriesForPrompt(env.ACE_MEMORY, message);
      systemText = buildSystemPrompt(SYSTEM_PROMPT, memories);
      memoryState = "on";
    } catch (error) {
      memoryState = "off";
    }
  }

  const outcome = await answerWithFallback(env, secret, message, systemText);
  if (outcome.reply) {
    return json({ reply: outcome.reply, model: outcome.model, memory: memoryState }, 200, origin);
  }
  if (outcome.kind === "key") {
    return json({
      error: "Gemini refused the key.",
      details: "Cloudflare could not sign in to Gemini. Check that the GEMINI_API_KEY secret is a current free-tier key from Google AI Studio. The key is not included here.",
    }, 502, origin);
  }
  return json({
    error: "Gemini could not answer. Please try again.",
    details: outcome.details || "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.",
  }, 502, origin);
}

async function handleMemory(request, env, origin, url) {
  const access = memoryAccess(env, request);
  if (!access.ok) return memoryDenied(access.reason, origin);

  const id = decodeURIComponent(url.pathname.replace(/^\/memory\/?/, "")).trim();
  try {
    if (request.method === "GET" && !id) {
      const memories = await listMemories(env.ACE_MEMORY);
      return json({ memories }, 200, origin);
    }
    if (request.method === "POST" && !id) {
      const result = await addMemory(env.ACE_MEMORY, await readJson(request));
      return json(result.body, result.status, origin);
    }
    if (request.method === "PUT" && id) {
      const result = await updateMemory(env.ACE_MEMORY, id, await readJson(request));
      return json(result.body, result.status, origin);
    }
    if (request.method === "DELETE" && id) {
      const result = await deleteMemory(env.ACE_MEMORY, id);
      return json(result.body, result.status, origin);
    }
  } catch (error) {
    return json({
      error: "Memory could not be updated.",
      details: "The memory store did not respond. Chat still works without it.",
    }, 500, origin);
  }
  return json({ error: "Method not allowed.", details: "Use GET, POST, PUT or DELETE on /memory." }, 405, origin);
}

function memoryDenied(reason, origin) {
  if (reason === "token") {
    return json({
      error: "Memory is locked.",
      details: "Send the " + TOKEN_HEADER + " header. Chat still works without it.",
    }, 401, origin);
  }
  if (reason === "kv") {
    return json({
      error: "Memory is not available.",
      details: "The ACE_MEMORY binding is missing. Chat still works without memory.",
    }, 503, origin);
  }
  return json({
    error: "Memory is not available.",
    details: "The ACE_MEMORY_TOKEN secret is missing. Chat still works without memory.",
  }, 503, origin);
}

async function readJson(request) {
  try {
    return await request.json();
  } catch (error) {
    return {};
  }
}

async function answerWithFallback(env, secret, message, systemText) {
  const tried = [];
  for (const model of modelList(env)) {
    for (let attempt = 0; attempt < 2; attempt++) {
      let result;
      try {
        result = await askModel(env, model, message, secret, systemText);
      } catch (error) {
        tried.push(model + ": " + safeText(error && error.message, secret));
        break;
      }

      const reply = extractReply(result.data);
      if (result.status === 200 && reply) {
        return { reply, model };
      }
      if (result.status === 200 && isSafetyBlock(result.data)) {
        return {
          reply: "I can't help with that request. Please ask it in a different way.",
          model,
        };
      }

      const geminiText = safeText(geminiMessage(result.data), secret);
      const code = result.status;
      if (code === 401 || code === 403 || /api key not valid|permission denied|unauthenticated/i.test(geminiText)) {
        return { kind: "key" };
      }

      tried.push(model + " (" + code + "): " + (geminiText || "no details"));
      const retryable = code === 429 || code === 500 || code === 503 || code === 404
        || /high demand|unavailable|overloaded|not found|not available|resource exhausted/i.test(geminiText);
      if (!retryable) {
        return {
          kind: "upstream",
          details: geminiText || "Gemini returned an unexpected error.",
        };
      }
      if (attempt === 0 && (code === 429 || code === 503)) {
        await delay(retryDelay(env));
        continue;
      }
      break;
    }
  }

  const names = modelList(env).join(" and ");
  const sawBusy = tried.some((line) => /503|429|high demand|unavailable|overloaded|resource exhausted/i.test(line));
  if (sawBusy) {
    return {
      kind: "busy",
      details: "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later. Tried " + names + ".",
    };
  }
  return {
    kind: "upstream",
    details: safeText(tried.join(" | "), secret) || "ACE could not reach Gemini.",
  };
}

async function askModel(env, model, message, secret, systemText) {
  const url = apiBase(env) + "/models/" + encodeURIComponent(model) + ":generateContent";
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": secret,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemText || SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: message }] }],
      generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
    }),
    signal: AbortSignal.timeout(20000),
  });
  const raw = await response.text();
  let data = {};
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch (error) {
      data = { error: { message: raw.slice(0, 300) } };
    }
  }
  return { status: response.status, data, model };
}

function modelList(env) {
  const raw = typeof env.GEMINI_MODELS === "string" ? env.GEMINI_MODELS : "";
  const models = raw.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 4);
  return models.length ? models : DEFAULT_MODELS.slice();
}

function apiBase(env) {
  const raw = typeof env.GEMINI_API_BASE === "string" ? env.GEMINI_API_BASE.trim() : "";
  if (!raw) return GOOGLE_BASE;
  try {
    const url = new URL(raw);
    const local = url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
    const google = url.protocol === "https:" && url.hostname === "generativelanguage.googleapis.com";
    if (local || google) return (url.origin + url.pathname).replace(/\/$/, "");
  } catch (error) {
    return GOOGLE_BASE;
  }
  return GOOGLE_BASE;
}

function retryDelay(env) {
  const value = Number(env.GEMINI_RETRY_MS);
  if (Number.isFinite(value) && value >= 0 && value <= 5000) return value;
  return 700;
}

function extractReply(data) {
  const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .filter((part) => part && typeof part.text === "string" && part.thought !== true)
    .map((part) => part.text)
    .join("")
    .trim();
}

function isSafetyBlock(data) {
  const reason = (data && data.promptFeedback && data.promptFeedback.blockReason)
    || (data && data.candidates && data.candidates[0] && data.candidates[0].finishReason)
    || "";
  return reason === "SAFETY" || reason === "PROHIBITED_CONTENT" || reason === "BLOCKLIST";
}

function geminiMessage(data) {
  if (!data) return "";
  if (typeof data.error === "string") return data.error;
  if (data.error && typeof data.error.message === "string") return data.error.message;
  return "";
}

function safeText(value, secret) {
  let text = String(value || "Unexpected error").replace(/\s+/g, " ").trim();
  if (secret) text = text.split(secret).join("[redacted]");
  text = text.replace(/AIza[0-9A-Za-z\-_]{10,}/g, "[redacted]");
  return text.slice(0, 500);
}

function corsHeaders(origin) {
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, " + TOKEN_HEADER,
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(origin),
    },
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
