// Deterministic voice features — no LLM, pure stats over the sample corpus.
//
// These features carry MORE weight than LLM-derived ones in voice fidelity
// scoring, because they're cheap, reproducible, and don't hallucinate.

import type {
  SentenceStats,
  Lexicon,
  PunctuationSignature,
} from "@workspace/db";

const STOPWORDS = new Set([
  "the","a","an","and","or","but","if","then","else","when","while","of",
  "at","by","for","with","about","against","between","into","through","during",
  "before","after","above","below","to","from","up","down","in","out","on","off",
  "over","under","again","further","then","once","here","there","is","are","was",
  "were","be","been","being","have","has","had","having","do","does","did",
  "doing","i","me","my","we","us","our","you","your","he","him","his","she","her",
  "it","its","they","them","their","that","this","these","those","what","which",
  "who","whom","as","so","just","very","not","no","yes","can","will","would",
  "should","could","may","might","must","shall",
]);

// Common Hindi/Urdu function & filler words in Devanagari (YouTube Urdu
// auto-captions often come out in Devanagari). Filtered so the deterministic
// signature words are distinctive content, not pronouns/postpositions. The LLM
// pass re-romanizes + re-filters, but a clean input improves its output.
const DEVANAGARI_STOPWORDS = new Set([
  "आप", "आपको", "आपकी", "आपका", "आपके", "और", "एक", "हम", "हमें", "हमारा",
  "नहीं", "नही", "यह", "ये", "वह", "वो", "है", "हैं", "था", "थी", "थे",
  "का", "की", "के", "को", "में", "से", "पर", "कि", "तो", "भी", "ही", "जो",
  "कर", "करना", "करने", "करता", "करती", "करते", "रहा", "रही", "रहे", "रहना",
  "अब", "जब", "अगर", "इस", "उस", "इन", "उन", "इसको", "उसको", "उसका", "उसकी",
  "उसके", "क्या", "कैसे", "सकता", "सकती", "सकते", "मैं", "मेरा", "मेरे", "हो",
  "गया", "गई", "गए", "साथ", "लिए", "कुछ", "बहुत", "यहाँ", "वहाँ", "अपना",
  "अपने", "अपनी", "होता", "होती", "होते", "लेकिन", "फिर", "जैसे", "तरह",
]);

export type DeterministicVoiceOutput = {
  sentence_stats: SentenceStats;
  lexicon: Pick<Lexicon, "signature_words" | "avoided_words">;
  punctuation: PunctuationSignature;
  total_words: number;
  total_sentences: number;
};

export function extractDeterministicVoice(samples: Array<{ content: string }>): DeterministicVoiceOutput {
  const all = samples.map((s) => s.content).join(" \n ");
  const sentences = splitSentences(all);
  const sentenceLengths = sentences.map((s) => wordCount(s)).filter((n) => n > 0);

  const total_words = sentenceLengths.reduce((a, b) => a + b, 0);
  const total_sentences = sentenceLengths.length || 1;

  const avg_len = total_words / total_sentences;
  const p90_len = percentile(sentenceLengths, 0.9);

  const declarative = sentences.filter((s) => /[.!?]\s*$/.test(s.trim()) && !/[?!]$/.test(s.trim())).length;
  const interrogative = sentences.filter((s) => /\?\s*$/.test(s.trim())).length;
  const imperative = sentences.filter(isLikelyImperative).length;
  const fragment = sentences.filter((s) => wordCount(s) <= 3).length;

  const sentence_stats: SentenceStats = {
    avg_len,
    p90_len,
    declarative_ratio: declarative / total_sentences,
    question_ratio: interrogative / total_sentences,
    imperative_ratio: imperative / total_sentences,
    fragment_ratio: fragment / total_sentences,
  };

  const lexicon = extractLexicon(all);

  const punctuation: PunctuationSignature = {
    em_dash_density: count(all, /—|--/g) / Math.max(1, total_words),
    colon_use: count(all, /:/g) / Math.max(1, total_words),
    ellipsis_use: count(all, /\.\.\./g) / Math.max(1, total_words),
    exclamation_density: count(all, /!/g) / Math.max(1, total_words),
  };

  return {
    sentence_stats,
    lexicon,
    punctuation,
    total_words,
    total_sentences,
  };
}

function splitSentences(text: string): string[] {
  // Naive splitter — fine for stats over many samples. Avoid splitting on "Mr."
  // by requiring whitespace + capital after the punctuation.
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z“"])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx]!;
}

function count(haystack: string, pattern: RegExp): number {
  return (haystack.match(pattern) ?? []).length;
}

function isLikelyImperative(sentence: string): boolean {
  const first = sentence.trim().split(/\s+/)[0] ?? "";
  if (!first) return false;
  // Lowercase, non-pronoun, starts-with-verb is a weak proxy. Good enough for
  // a ratio metric over many samples.
  if (/^(don't|do|stop|start|build|ship|listen|think|notice|remember|consider|imagine|try)$/i.test(first)) {
    return true;
  }
  return false;
}

function extractLexicon(text: string): Pick<Lexicon, "signature_words" | "avoided_words"> {
  // Tokenize, count, drop stopwords, return top by frequency. Real IDF requires
  // a corpus to compare against; we approximate "distinctive" with "frequent
  // non-stopword content tokens" and let the LLM pass refine.
  //
  // Script-aware: the STOPWORDS list is English. On predominantly non-Latin
  // text (e.g. Urdu/Hindi YouTube transcripts) we tokenize with a Unicode
  // letter class and SKIP the English stopword filter (it doesn't apply and we
  // have no per-language list), so signature words still surface in-script.
  const latinChars = (text.match(/[a-z]/gi) ?? []).length;
  const letterChars = (text.match(/\p{L}/gu) ?? []).length;
  const mostlyLatin = letterChars === 0 || latinChars / letterChars > 0.5;

  let tokens: string[];
  if (mostlyLatin) {
    tokens = text
      .toLowerCase()
      .split(/[^a-z'-]+/)
      .filter((t) => t.length >= 4 && !STOPWORDS.has(t));
  } else {
    // Unicode word tokenization. Indic scripts attach vowel signs as combining
    // MARKS (\p{M}), not letters — include them or words get chopped
    // (आपको → आपक). Filter common Hindi/Urdu (Devanagari) function words so the
    // top tokens are distinctive, not filler.
    tokens = (text.match(/[\p{L}\p{M}][\p{L}\p{M}'-]*/gu) ?? []).filter(
      (t) => t.length >= 2 && !DEVANAGARI_STOPWORDS.has(t)
    );
  }

  const freq = new Map<string, number>();
  for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);

  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
  const signature_words = sorted.slice(0, 25).map(([w]) => w);

  // No "avoided_words" can be derived deterministically from a single corpus;
  // user supplies these during onboarding. Return empty here.
  return { signature_words, avoided_words: [] };
}
