/**
 * Long-term memory for ACE.
 * Stored in the Cloudflare KV binding ACE_MEMORY.
 * Reads and writes require the Worker secret ACE_MEMORY_TOKEN.
 * The token is never written into KV and never returned to the browser.
 */

export const TOKEN_HEADER = "X-ACE-Memory-Token";
export const MEMORIES_KEY = "ace:memories";
export const SEEDED_KEY = "ace:seeded";

export const SEED_MEMORIES = [
  {
    kind: "name",
    text: "The user's name is Callum Pillay.",
  },
  {
    kind: "preference",
    text: "Callum prefers ACE to sound like a calm, articulate, warm British gentleman, and to say brother only occasionally.",
  },
  {
    kind: "preference",
    text: "Callum uses ACE hands-free on a Samsung Galaxy A53 5G and wants a British male spoken voice.",
  },
  {
    kind: "project",
    text: "Project ACE is Callum's personal assistant. The website is on GitHub Pages and the brain is the Cloudflare Worker ace-brain.",
  },
  {
    kind: "project",
    text: "Callum wants practical help with planning, research, business ideas and task lists, including a goal of about R3000 a month in South African rand.",
  },
  {
    kind: "note",
    text: "Approved boundary: never store passwords, PINs, banking details, payment details, or verification codes.",
  },
];

const KINDS = new Set(["name", "preference", "project", "note"]);

export function memoryAccess(env, request) {
  const expected = typeof env.ACE_MEMORY_TOKEN === "string" ? env.ACE_MEMORY_TOKEN.trim() : "";
  const provided = String(request.headers.get(TOKEN_HEADER) || "").trim();
  if (!expected) return { ok: false, reason: "secret" };
  if (!tokensMatch(provided, expected)) return { ok: false, reason: "token" };
  if (!env.ACE_MEMORY || typeof env.ACE_MEMORY.get !== "function" || typeof env.ACE_MEMORY.put !== "function") {
    return { ok: false, reason: "kv" };
  }
  return { ok: true };
}

export function tokensMatch(provided, expected) {
  const left = String(provided || "");
  const right = String(expected || "");
  if (!left || !right || left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

export function isForbiddenMemory(text) {
  const value = String(text || "");
  if (/AIza[0-9A-Za-z\-_]{10,}/.test(value)) return true;
  if (/\bsk-[A-Za-z0-9]{10,}/.test(value)) return true;
  if (/\b(?:\d[ -]?){13,19}\b/.test(value)) return true;
  if (/\b(password|passcode|pin|cvv|cvc|otp|verification code|one-time code|api[_ -]?key|secret key|access token|bearer token)\b\s*(is|was|:|=)\s*\S+/i.test(value)) return true;
  if (/\b(my pin|my password|my passcode|bank account|account number|sort code|card number|iban|banking pin|banking password|banking details)\b/i.test(value)) return true;
  return false;
}

export function memoryCommand(message) {
  const text = String(message || "").trim();
  const remember = text.match(/^remember\b[\s,:-]*(.*)$/i);
  if (remember) {
    return { type: "remember", text: remember[1].replace(/^that\b[\s,:-]*/i, "").trim() };
  }
  const forget = text.match(/^forget\b[\s,:-]*(.*)$/i);
  if (forget) {
    return { type: "forget", text: forget[1].replace(/^that\b[\s,:-]*/i, "").trim() };
  }
  return null;
}

export function unavailableReply(reason) {
  if (reason === "kv") {
    return "I heard you, but long-term memory is not switched on in Cloudflare yet. I have not stored that.";
  }
  if (reason === "secret") {
    return "I heard you, but the memory token is not set on the brain yet. I have not stored that.";
  }
  return "I can chat without memory, but I will not remember or forget anything until the memory token is saved in settings on this phone.";
}

export async function listMemories(kv) {
  await ensureSeeded(kv);
  return readAll(kv);
}

export async function addMemory(kv, input) {
  const text = cleanText(input && input.text);
  if (!text) {
    return { status: 400, body: { error: "Please enter a memory.", details: "Say what ACE should remember." } };
  }
  if (isForbiddenMemory(text)) return forbiddenBody();
  await ensureSeeded(kv);
  const memories = await readAll(kv);
  const memory = makeMemory(text, input && input.kind);
  memories.push(memory);
  await writeAll(kv, memories);
  return { status: 201, body: { memory } };
}

export async function updateMemory(kv, id, input) {
  const text = cleanText(input && input.text);
  if (!text) {
    return { status: 400, body: { error: "Please enter a memory.", details: "The updated text was empty." } };
  }
  if (isForbiddenMemory(text)) return forbiddenBody();
  await ensureSeeded(kv);
  const memories = await readAll(kv);
  const index = memories.findIndex((item) => item.id === id);
  if (index < 0) return missing(id);
  memories[index] = {
    ...memories[index],
    text,
    kind: normalKind(input && input.kind, memories[index].kind),
    updatedAt: new Date().toISOString(),
  };
  await writeAll(kv, memories);
  return { status: 200, body: { memory: memories[index] } };
}

export async function deleteMemory(kv, id) {
  await ensureSeeded(kv);
  const memories = await readAll(kv);
  const next = memories.filter((item) => item.id !== id);
  if (next.length === memories.length) return missing(id);
  await writeAll(kv, next);
  return { status: 200, body: { deleted: true, id } };
}

export async function applyCommand(kv, command) {
  if (command.type === "remember") {
    if (!command.text) {
      return { reply: "Tell me what to remember after the word remember." };
    }
    const saved = await addMemory(kv, { text: command.text, kind: "note" });
    if (saved.status === 400 && saved.body && saved.body.error === "That cannot be remembered.") {
      return { reply: "I will not remember that. I do not store passwords, PINs, banking details, or other secrets." };
    }
    if (saved.status !== 201) {
      return { reply: "I could not store that memory." };
    }
    return { reply: "Remembered. I will keep that for next time.", saved: saved.body.memory };
  }

  const query = command.text;
  if (!query) {
    return { reply: "Tell me what to forget after the word forget." };
  }
  await ensureSeeded(kv);
  const memories = await readAll(kv);
  const wipe = /^(all|everything)$/i.test(query);
  const removed = memories.filter((item) => wipe || item.text.toLowerCase().includes(query.toLowerCase()));
  if (!removed.length) {
    return { reply: "I looked, and I do not have a memory matching that." };
  }
  const removedIds = new Set(removed.map((item) => item.id));
  await writeAll(kv, memories.filter((item) => !removedIds.has(item.id)));
  const count = removed.length;
  return {
    reply: count === 1 ? "Forgotten. I have removed that memory." : "Forgotten. I have removed " + count + " memories.",
    deleted: removed.map((item) => item.id),
  };
}

export async function memoriesForPrompt(kv, message) {
  const all = await listMemories(kv);
  return selectMemories(all, message);
}

export function selectMemories(memories, message) {
  const words = new Set(String(message || "").toLowerCase().match(/[a-z0-9]{4,}/g) || []);
  const core = memories.filter((item) => item.kind === "name" || item.kind === "preference" || item.kind === "project");
  const notes = memories.filter((item) => item.kind === "note");
  const matched = notes.filter((item) => {
    const hay = item.text.toLowerCase();
    for (const word of words) if (hay.includes(word)) return true;
    return false;
  });
  const chosen = matched.length ? core.concat(matched) : core.concat(notes.slice(-8));
  const seen = new Set();
  const unique = [];
  for (const item of chosen) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
    if (unique.length >= 24) break;
  }
  return unique;
}

export function buildSystemPrompt(base, memories) {
  if (!memories || !memories.length) return base;
  const lines = memories.map((item) => "- [" + item.kind + "] " + item.text);
  return base + "\n\nApproved long-term memory. Use it when it helps. Do not invent memories, and do not recite the whole list unless asked.\n" + lines.join("\n");
}

async function ensureSeeded(kv) {
  const flag = await kv.get(SEEDED_KEY);
  if (flag) return;
  const existing = await kv.get(MEMORIES_KEY);
  if (existing) {
    await kv.put(SEEDED_KEY, "1");
    return;
  }
  const now = new Date().toISOString();
  const seeded = SEED_MEMORIES.map((item, index) => ({
    id: "mem_seed_" + (index + 1),
    kind: item.kind,
    text: item.text,
    createdAt: now,
    updatedAt: now,
  }));
  await writeAll(kv, seeded);
  await kv.put(SEEDED_KEY, "1");
}

async function readAll(kv) {
  const raw = await kv.get(MEMORIES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => item && item.id && item.text) : [];
  } catch (error) {
    return [];
  }
}

async function writeAll(kv, memories) {
  await kv.put(MEMORIES_KEY, JSON.stringify(memories));
}

function makeMemory(text, kind) {
  const now = new Date().toISOString();
  return {
    id: "mem_" + crypto.randomUUID(),
    kind: normalKind(kind, "note"),
    text,
    createdAt: now,
    updatedAt: now,
  };
}

function normalKind(kind, fallback) {
  const value = String(kind || "").trim().toLowerCase();
  return KINDS.has(value) ? value : (fallback || "note");
}

function cleanText(text) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, 500);
}

function forbiddenBody() {
  return {
    status: 400,
    body: {
      error: "That cannot be remembered.",
      details: "ACE does not store passwords, PINs, banking details, or other secrets.",
    },
  };
}

function missing(id) {
  return {
    status: 404,
    body: { error: "Memory not found.", details: "No memory with id " + id + "." },
  };
}
