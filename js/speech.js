/**
 * Speech helpers for ACE.
 * The on-screen reply is left untouched. Only the text passed to the
 * browser's speech engine should go through cleanSpeechText.
 */

export const SPEECH_RATE = 0.94;
export const SPEECH_PITCH = 0.86;
export const VOICE_STORAGE_KEY = "ace.voice";

const MALE_NAME = /male|\bdaniel\b|\bgeorge\b|\bryan\b|\barthur\b|\bbrian\b|\bjames\b|\bmalcolm\b/i;
const FEMALE_NAME = /female|\bfiona\b|\bkate\b|\bserena\b|\bemma\b|\bsusan\b|\bmartha\b|\blibby\b|\bsonia\b/i;

export function cleanSpeechText(input) {
  if (input == null) return "";
  let text = String(input).replace(/\r\n/g, "\n");

  text = text.replace(/```[\w-]*\n?([\s\S]*?)```/g, (_, inner) => "\n" + inner + "\n");
  text = text.replace(/```/g, " ");
  text = text.replace(/`([^`]+)`/g, "$1");

  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");

  text = text.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  text = text.replace(/^\s*>\s?/gm, "");
  text = text.replace(/^\s*[-*+•]\s+/gm, "");
  text = text.replace(/^\s*\d+[.)]\s+/gm, "");
  text = text.replace(/^\s*---+\s*$/gm, "");
  text = text.replace(/\|/g, " ");

  text = text.replace(/\*\*\*([^*]+)\*\*\*/g, "$1");
  text = text.replace(/\*\*([^*]+)\*\*/g, "$1");
  text = text.replace(/___([^_]+)___/g, "$1");
  text = text.replace(/__([^_]+)__/g, "$1");
  text = text.replace(/(^|[\s([{"“])\*([^*\n]+)\*(?=($|[\s)\]}"”,.!?;:]))/g, "$1$2");
  text = text.replace(/(^|[\s([{"“])_([^_\n]+)_(?=($|[\s)\]}"”,.!?;:]))/g, "$1$2");

  text = text.replace(/[*#`]+/g, "");
  text = text.replace(/[ \t]+\n/g, "\n");
  text = text.replace(/[ \t]{2,}/g, " ");

  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  text = lines.join(". ");
  text = text.replace(/([.!?])\.\s+/g, "$1 ");
  text = text.replace(/\s+([,.;!?])/g, "$1");
  text = text.replace(/[ \t]{2,}/g, " ");
  return text.trim();
}

export function pickVoice(voices, saved) {
  const list = Array.isArray(voices) ? voices.filter(Boolean) : [];
  if (saved) {
    const chosen = list.find((voice) => voice.voiceURI === saved || voice.name === saved);
    if (chosen) return chosen;
  }
  const british = list.filter(isBritish);
  const britishMale = british.find((voice) => isMale(voice) && !isFemale(voice));
  if (britishMale) return britishMale;
  const britishNeutral = british.find((voice) => !isFemale(voice));
  if (britishNeutral) return britishNeutral;
  if (british[0]) return british[0];
  const englishMale = list.find((voice) => isEnglish(voice) && isMale(voice) && !isFemale(voice));
  if (englishMale) return englishMale;
  return list.find(isEnglish) || list[0] || null;
}

export function orderVoices(voices) {
  return (Array.isArray(voices) ? voices.filter(Boolean) : []).slice().sort((a, b) => score(b) - score(a) || String(a.name).localeCompare(String(b.name)));
}

function isBritish(voice) {
  const lang = String(voice.lang || "");
  const name = String(voice.name || "");
  return /^en[-_]GB/i.test(lang) || /united kingdom|uk english|en[-_]GB/i.test(name);
}

function isEnglish(voice) {
  return /^en/i.test(String(voice.lang || "")) || /^en/i.test(String(voice.name || ""));
}

function isMale(voice) {
  return MALE_NAME.test(String(voice.name || ""));
}

function isFemale(voice) {
  return FEMALE_NAME.test(String(voice.name || ""));
}

function score(voice) {
  let value = 0;
  if (isBritish(voice)) value += 4;
  if (isMale(voice) && !isFemale(voice)) value += 2;
  else if (isEnglish(voice) && !isFemale(voice)) value += 1;
  return value;
}

if (typeof window !== "undefined") {
  window.ACE_SPEECH = {
    cleanSpeechText,
    pickVoice,
    orderVoices,
    rate: SPEECH_RATE,
    pitch: SPEECH_PITCH,
    storageKey: VOICE_STORAGE_KEY,
  };
  window.dispatchEvent(new Event("ace-speech-ready"));
}
