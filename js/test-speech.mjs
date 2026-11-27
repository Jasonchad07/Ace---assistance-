import { cleanSpeechText, pickVoice, orderVoices, SPEECH_RATE, SPEECH_PITCH } from "./speech.js";

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

function eq(actual, expected, label) {
  if (actual === expected) {
    passed += 1;
    console.log("PASS " + label);
  } else {
    failed += 1;
    console.error("FAIL " + label);
    console.error("  expected: " + JSON.stringify(expected));
    console.error("  actual:   " + JSON.stringify(actual));
  }
}

eq(cleanSpeechText(null), "", "null becomes empty");
eq(cleanSpeechText("Good day. I am ready."), "Good day. I am ready.", "plain sentence stays");
eq(cleanSpeechText("Don't change R3000 or en-GB."), "Don't change R3000 or en-GB.", "punctuation, money and hyphens stay");
eq(cleanSpeechText("Use GEMINI_API_KEY in the secret store."), "Use GEMINI_API_KEY in the secret store.", "snake case stays");

eq(cleanSpeechText("**Hello**, brother."), "Hello, brother.", "bold is removed");
eq(cleanSpeechText("A *quiet* word."), "A quiet word.", "italic asterisks are removed");
eq(cleanSpeechText("A _quiet_ word."), "A quiet word.", "italic underscores are removed");
eq(cleanSpeechText("This is __important__ today."), "This is important today.", "strong underscores are removed");

eq(
  cleanSpeechText("# Morning plan\n\n## First\nDo the useful thing."),
  "Morning plan. First. Do the useful thing.",
  "headings are spoken as words",
);

eq(
  cleanSpeechText("- Buy tea\n- Write the list\n* Call once"),
  "Buy tea. Write the list. Call once",
  "bullets are removed",
);

eq(
  cleanSpeechText("1. First step\n2) Second step"),
  "First step. Second step",
  "numbered markers are removed",
);

eq(
  cleanSpeechText("See [the notes](https://example.com/path) today."),
  "See the notes today.",
  "markdown links keep the label",
);

eq(
  cleanSpeechText("![chart](https://example.com/a.png) The chart is ready."),
  "chart The chart is ready.",
  "images keep the description",
);

eq(
  cleanSpeechText("Run `npm test` now.\n\n```js\nconst ready = true;\n```"),
  "Run npm test now. const ready = true;",
  "code markers are removed and the words stay",
);

eq(cleanSpeechText("> A quoted line."), "A quoted line.", "blockquote marker is removed");
eq(cleanSpeechText("Left | right"), "Left right", "table pipes are not spoken");
eq(cleanSpeechText("Stray *** marks # left."), "Stray marks left.", "stray symbols are removed");

const daniel = { name: "Daniel", lang: "en-GB", voiceURI: "daniel" };
const googleMale = { name: "Google UK English Male", lang: "en-GB", voiceURI: "google-male" };
const googleFemale = { name: "Google UK English Female", lang: "en-GB", voiceURI: "google-female" };
const ukPlain = { name: "English (United Kingdom)", lang: "en-GB", voiceURI: "uk-plain" };
const usMale = { name: "Google US English Male", lang: "en-US", voiceURI: "us-male" };
const savedFemale = { name: "Serena", lang: "en-GB", voiceURI: "serena" };

assert(pickVoice([googleFemale, googleMale, usMale], "").voiceURI === "google-male", "prefers the British male voice");
assert(pickVoice([googleFemale, ukPlain], "").voiceURI === "uk-plain", "British voice with no gender beats a named female");
assert(pickVoice([googleFemale], "").voiceURI === "google-female", "a British female is used when she is the only British voice");
assert(pickVoice([usMale, { name: "French", lang: "fr-FR", voiceURI: "fr" }], "").voiceURI === "us-male", "falls back to an English male");
assert(pickVoice([savedFemale, googleMale], "serena").voiceURI === "serena", "a saved choice wins");
assert(pickVoice([googleMale], "missing") === googleMale, "a missing saved choice falls back");
assert(pickVoice([], "") === null, "no voices returns null");

const ordered = orderVoices([usMale, googleFemale, googleMale]);
assert(ordered[0].voiceURI === "google-male", "menu lists the British male first");
assert(SPEECH_RATE > 0.8 && SPEECH_RATE < 1.05, "rate is calm rather than rushed");
assert(SPEECH_PITCH >= 0.8 && SPEECH_PITCH <= 1, "pitch stays near a natural male voice");

console.log(passed + " passed, " + failed + " failed");
if (failed) process.exit(1);
