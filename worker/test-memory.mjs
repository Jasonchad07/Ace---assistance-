import worker, { SYSTEM_PROMPT } from "./ace-brain.js";
import { isForbiddenMemory, selectMemories } from "./memory.js";

const TOKEN = "phone-token-not-a-key";
const GEMINI = "gemini-test-key";
const PAGES = "https://jasonchad07.github.io";

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed += 1;
    console.log("PASS " + label);
  } else {
    failed += 1;
    console.error("FAIL " + label);
  }
}

function mockKv() {
  const data = new Map();
  return {
    async get(key) { return data.has(key) ? data.get(key) : null; },
    async put(key, value) { data.set(key, String(value)); },
    async delete(key) { data.delete(key); },
    dump() { return data; },
  };
}

const calls = [];
const originalFetch = globalThis.fetch;

function installFetch() {
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: "Noted." }] } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
}

async function call(method, path, env, { body, token, origin = PAGES } = {}) {
  const headers = { Origin: origin, "Content-Type": "application/json" };
  if (token) headers["X-ACE-Memory-Token"] = token;
  const response = await worker.fetch(new Request("https://ace.test" + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env);
  const raw = await response.text();
  let parsed = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch (error) { parsed = null; }
  return { status: response.status, body: parsed, raw, cors: response.headers.get("Access-Control-Allow-Origin"), allow: response.headers.get("Access-Control-Allow-Headers") };
}

const envBase = () => ({
  GEMINI_API_KEY: GEMINI,
  ACE_MEMORY_TOKEN: TOKEN,
  ACE_MEMORY: mockKv(),
  GEMINI_MODELS: "gemini-3.5-flash-lite",
  GEMINI_RETRY_MS: "0",
});

try {
  installFetch();

  assert(isForbiddenMemory("my pin is 1234"), "pin value is forbidden");
  assert(isForbiddenMemory("password: hunter2"), "password value is forbidden");
  assert(isForbiddenMemory("bank account 12345678"), "bank account is forbidden");
  assert(isForbiddenMemory("AIzaSyTHISISNOTAREALKEY123456"), "API key shape is forbidden");
  assert(!isForbiddenMemory("Callum wants help making R3000 a month."), "ordinary plan is allowed");
  assert(!isForbiddenMemory("The user's name is Callum Pillay."), "name is allowed");

  const locked = await call("GET", "/memory", envBase());
  assert(locked.status === 401, "memory list without token is locked");
  assert(/X-ACE-Memory-Token/.test(locked.body.details || ""), "locked response names the header");
  assert(!locked.raw.includes(TOKEN), "locked response does not echo the token");
  assert(locked.cors === PAGES, "locked response still allows the Pages origin");
  assert((locked.allow || "").includes("X-ACE-Memory-Token"), "CORS allows the memory header");

  const wrong = await call("GET", "/memory", envBase(), { token: "nope" });
  assert(wrong.status === 401, "wrong token is locked");

  const noSecret = await call("GET", "/memory", { GEMINI_API_KEY: GEMINI, ACE_MEMORY: mockKv() }, { token: TOKEN });
  assert(noSecret.status === 503 && /ACE_MEMORY_TOKEN/.test(noSecret.body.details || ""), "missing token secret is explained");

  const noKv = await call("GET", "/memory", { GEMINI_API_KEY: GEMINI, ACE_MEMORY_TOKEN: TOKEN }, { token: TOKEN });
  assert(noKv.status === 503 && /ACE_MEMORY/.test(noKv.body.details || ""), "missing KV binding is explained");

  const env = envBase();
  const listed = await call("GET", "/memory", env, { token: TOKEN });
  assert(listed.status === 200, "list status");
  assert(listed.body.memories.some((item) => item.text.includes("Callum Pillay")), "seed includes Callum Pillay");
  assert(listed.body.memories.some((item) => item.kind === "preference"), "seed includes a preference");
  assert(listed.body.memories.some((item) => item.kind === "project"), "seed includes project info");

  const added = await call("POST", "/memory", env, { token: TOKEN, body: { text: "The kettle is blue.", kind: "note" } });
  assert(added.status === 201 && added.body.memory.id, "add returns the memory");
  const id = added.body.memory.id;

  const updated = await call("PUT", "/memory/" + id, env, { token: TOKEN, body: { text: "The kettle is green." } });
  assert(updated.status === 200 && updated.body.memory.text === "The kettle is green.", "update changes the text");

  const after = await call("GET", "/memory", env, { token: TOKEN });
  assert(after.body.memories.some((item) => item.id === id && item.text === "The kettle is green."), "list shows the update");

  const removed = await call("DELETE", "/memory/" + id, env, { token: TOKEN });
  assert(removed.status === 200 && removed.body.deleted === true && removed.body.id === id, "delete confirms the id");
  const gone = await call("GET", "/memory", env, { token: TOKEN });
  assert(!gone.body.memories.some((item) => item.id === id), "deleted memory is gone");

  const secretAdd = await call("POST", "/memory", env, { token: TOKEN, body: { text: "my pin is 4321" } });
  assert(secretAdd.status === 400, "secret add is refused");
  assert(!secretAdd.body.memory && !/4321/.test(JSON.stringify(secretAdd.body)), "secret add does not store or echo the secret");
  const still = await call("GET", "/memory", env, { token: TOKEN });
  assert(!still.body.memories.some((item) => /4321/.test(item.text)), "secret text is not in the store");

  calls.length = 0;
  const remembered = await call("POST", "/", env, { token: TOKEN, body: { message: "remember that the studio key is on the left" } });
  assert(remembered.status === 200 && /Remembered/.test(remembered.body.reply), "remember command stores without calling Gemini");
  assert(calls.length === 0, "remember does not call Gemini");
  assert(remembered.body.memory === "on", "remember reports memory on");

  const refused = await call("POST", "/", env, { token: TOKEN, body: { message: "remember my password is swordfish" } });
  assert(refused.status === 200 && /will not remember/i.test(refused.body.reply), "remember refuses a password");
  const stored = await call("GET", "/memory", env, { token: TOKEN });
  assert(stored.body.memories.some((item) => item.text.includes("studio key is on the left")), "allowed remember is stored");
  assert(!stored.body.memories.some((item) => /swordfish/.test(item.text)), "password remember is not stored");

  const forgotten = await call("POST", "/", env, { token: TOKEN, body: { message: "forget the studio key" } });
  assert(forgotten.status === 200 && /Forgotten/.test(forgotten.body.reply), "forget removes a matching memory");
  const afterForget = await call("GET", "/memory", env, { token: TOKEN });
  assert(!afterForget.body.memories.some((item) => /studio key/.test(item.text)), "forgotten memory is gone");

  calls.length = 0;
  const chat = await call("POST", "/", env, { token: TOKEN, body: { message: "What is my name?" } });
  assert(chat.status === 200 && chat.body.memory === "on" && chat.body.reply === "Noted.", "chat with token still answers");
  const prompt = calls[0].body.systemInstruction.parts[0].text;
  assert(prompt.includes("Callum Pillay"), "chat injects the name into the system prompt");
  assert(prompt.startsWith(SYSTEM_PROMPT), "persona stays in front of the memories");

  calls.length = 0;
  const plain = await call("POST", "/", env, { body: { message: "What is my name?" } });
  assert(plain.status === 200 && plain.body.memory === "off", "chat without token still works");
  assert(calls[0].body.systemInstruction.parts[0].text === SYSTEM_PROMPT, "chat without token does not inject memory");

  const unnamed = selectMemories([
    { id: "1", kind: "name", text: "The user's name is Callum Pillay." },
    { id: "2", kind: "note", text: "The kettle is green." },
    ...Array.from({ length: 9 }, (_, index) => ({ id: "n" + index, kind: "note", text: "Unrelated note " + index + " about nothing." })),
  ], "Where is the kettle?");
  assert(unnamed.some((item) => /kettle/.test(item.text)), "a matching note is selected");
  assert(!unnamed.some((item) => /Unrelated note 0/.test(item.text)), "unrelated notes are left out when something matches");
} finally {
  globalThis.fetch = originalFetch;
}

console.log(passed + " passed, " + failed + " failed");
if (failed) process.exit(1);
