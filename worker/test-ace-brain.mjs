import worker from "./ace-brain.js";

const SECRET = "AIzaTESTKEY1234567890VALUE";
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

async function call(method, url, env, { origin = PAGES, body } = {}) {
  const response = await worker.fetch(new Request(url, {
    method,
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : body,
  }), env);
  const raw = await response.text();
  let parsed = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch (error) { parsed = null; }
  return {
    status: response.status,
    cors: response.headers.get("Access-Control-Allow-Origin"),
    methods: response.headers.get("Access-Control-Allow-Methods"),
    type: response.headers.get("Content-Type") || "",
    body: parsed,
    raw,
  };
}

const originalFetch = globalThis.fetch;
const calls = [];

function mockFetch(handler) {
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  };
}

function geminiResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

try {
  const health = await call("GET", "https://ace.test/");
  assert(health.status === 200, "GET health status");
  assert(health.body && health.body.brain === "Gemini", "GET health names Gemini");
  assert(health.cors === PAGES, "GET CORS allows GitHub Pages");
  assert(health.type.includes("application/json"), "GET is JSON");

  const options = await call("OPTIONS", "https://ace.test/");
  assert(options.status === 204, "OPTIONS status");
  assert(options.cors === PAGES, "OPTIONS CORS origin");
  assert((options.methods || "").includes("POST"), "OPTIONS allows POST");

  const local = await call("OPTIONS", "https://ace.test/", {}, { origin: "http://127.0.0.1:8080" });
  assert(local.cors === "http://127.0.0.1:8080", "localhost origin is allowed");

  const foreign = await call("GET", "https://ace.test/", {}, { origin: "https://evil.example" });
  assert(foreign.cors === null, "unknown origin is not reflected");

  const empty = await call("POST", "https://ace.test/", {}, { body: JSON.stringify({}) });
  assert(empty.status === 400, "empty message status");
  assert(empty.body && empty.body.error === "Please enter a message", "empty message text");

  const badJson = await call("POST", "https://ace.test/", {}, { body: "hello" });
  assert(badJson.status === 400, "invalid JSON status");
  assert(badJson.body && badJson.body.error, "invalid JSON has error");

  const missing = await call("POST", "https://ace.test/", {}, { body: JSON.stringify({ message: "hi" }) });
  assert(missing.status === 500, "missing secret status");
  assert(missing.body && /GEMINI_API_KEY/.test(missing.body.details || ""), "missing secret explains the secret name");
  assert(!JSON.stringify(missing.body).includes("AIza"), "missing secret response has no key");

  calls.length = 0;
  mockFetch((url) => {
    if (url.includes("gemini-3.5-flash-lite")) {
      return geminiResponse(503, {
        error: {
          code: 503,
          message: "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.",
          status: "UNAVAILABLE",
        },
      });
    }
    return geminiResponse(200, {
      candidates: [{
        content: {
          parts: [
            { thought: true, text: "hidden reasoning" },
            { text: "Ready when you are." },
          ],
        },
      }],
    });
  });

  const fallback = await call("POST", "https://ace.test/", {
    GEMINI_API_KEY: SECRET,
    GEMINI_RETRY_MS: "0",
  }, { body: JSON.stringify({ message: "hello" }) });

  assert(fallback.status === 200, "fallback model status");
  assert(fallback.body && fallback.body.reply === "Ready when you are.", "fallback reply skips thoughts");
  assert(fallback.body.model === "gemini-3.1-flash-lite", "fallback reports the model that answered");
  assert(calls.length >= 2, "busy model was tried before the fallback");
  assert(calls.every((item) => item.url.startsWith("https://generativelanguage.googleapis.com/")), "calls stay on Google's host");
  assert(calls.every((item) => !item.url.includes(SECRET)), "key is not in the URL");
  assert(calls.every((item) => item.init.headers["x-goog-api-key"] === SECRET), "key is sent as a header");
  assert(!fallback.raw.includes(SECRET), "success body does not echo the key");

  calls.length = 0;
  mockFetch(() => geminiResponse(503, {
    error: { message: "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later. Key " + SECRET },
  }));
  const busy = await call("POST", "https://ace.test/", {
    GEMINI_API_KEY: SECRET,
    GEMINI_RETRY_MS: "0",
  }, { body: JSON.stringify({ message: "hello again" }) });
  assert(busy.status === 502, "all models busy returns 502");
  assert(busy.body && busy.body.error && busy.body.details, "busy body has error and details");
  assert(busy.cors === PAGES, "busy response still has CORS");
  assert(!busy.raw.includes(SECRET) && !busy.raw.includes("AIza"), "busy body redacts the key");

  calls.length = 0;
  mockFetch(() => geminiResponse(400, { error: { message: "API key not valid. Please pass a valid API key." } }));
  const rejected = await call("POST", "https://ace.test/", {
    GEMINI_API_KEY: SECRET,
    GEMINI_RETRY_MS: "0",
  }, { body: JSON.stringify({ message: "hello" }) });
  assert(rejected.status === 502, "bad key status");
  assert(rejected.body && /GEMINI_API_KEY/.test(rejected.body.details || ""), "bad key tells the owner to check the secret");
  assert(calls.length === 1, "bad key does not keep trying models");

  calls.length = 0;
  mockFetch((url) => {
    assert(url.startsWith("http://127.0.0.1:9/"), "local test base is used");
    return geminiResponse(200, { candidates: [{ content: { parts: [{ text: "local" }] } }] });
  });
  const localBase = await call("POST", "https://ace.test/", {
    GEMINI_API_KEY: SECRET,
    GEMINI_API_BASE: "http://127.0.0.1:9/v1beta",
    GEMINI_MODELS: "gemini-3.5-flash-lite",
    GEMINI_RETRY_MS: "0",
  }, { body: JSON.stringify({ message: "ping" }) });
  assert(localBase.status === 200 && localBase.body.reply === "local", "local base returns the mock reply");

  calls.length = 0;
  mockFetch(() => {
    throw new Error("should not call a foreign host");
  });
  const blockedBase = await call("POST", "https://ace.test/", {
    GEMINI_API_KEY: SECRET,
    GEMINI_API_BASE: "https://evil.example/steal",
    GEMINI_MODELS: "gemini-3.5-flash-lite",
    GEMINI_RETRY_MS: "0",
  }, { body: JSON.stringify({ message: "ping" }) });
  assert(calls.length === 1, "foreign base was ignored and Google was called once");
  assert(calls[0].url.startsWith( "https://generativelanguage.googleapis.com/"), "foreign base fell back to Google");
  assert(blockedBase.status === 502, "thrown Google call becomes a JSON error");
  assert(!blockedBase.raw.includes(SECRET), "thrown error does not leak the key");
} finally {
  globalThis.fetch = originalFetch;
}

console.log(passed + " passed, " + failed + " failed");
if (failed) process.exit(1);
