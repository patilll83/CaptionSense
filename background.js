const API_BASE_URL = "https://api.dictionaryapi.dev/api/v2/entries/en/";
const CACHE_PREFIX = "definition:";
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "lookup-word") {
    return false;
  }

  lookupWord(message.word)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => {
      console.error("CaptionSense lookup failed", error);
      sendResponse({
        ok: false,
        error: "Could not load a definition right now."
      });
    });

  return true;
});

async function lookupWord(rawWord) {
  const normalizedWord = normalizeWord(rawWord);

  if (!normalizedWord) {
    return {
      word: rawWord,
      found: false,
      shortDefinition: "No definition available for this token."
    };
  }

  const cachedResult = await readCachedDefinition(normalizedWord);
  if (cachedResult) {
    return cachedResult;
  }

  const candidates = buildLookupCandidates(normalizedWord);

  for (const candidate of candidates) {
    const result = await fetchDefinition(candidate, rawWord);
    if (result?.found) {
      const hydratedResult = {
        ...result,
        requestedWord: rawWord
      };
      await writeCachedDefinition(normalizedWord, hydratedResult);
      return hydratedResult;
    }
  }

  const emptyResult = {
    word: normalizedWord,
    requestedWord: rawWord,
    found: false,
    shortDefinition: "No quick definition found for this word."
  };

  await writeCachedDefinition(normalizedWord, emptyResult);
  return emptyResult;
}

function normalizeWord(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^[^a-z]+|[^a-z]+$/g, "");
}

function buildLookupCandidates(word) {
  const candidates = new Set([word]);

  if (word.endsWith("ies") && word.length > 3) {
    candidates.add(`${word.slice(0, -3)}y`);
  }

  if (word.endsWith("es") && word.length > 2) {
    candidates.add(word.slice(0, -2));
  }

  if (word.endsWith("s") && word.length > 1) {
    candidates.add(word.slice(0, -1));
  }

  if (word.endsWith("ied") && word.length > 3) {
    candidates.add(`${word.slice(0, -3)}y`);
  }

  if (word.endsWith("ed") && word.length > 2) {
    candidates.add(word.slice(0, -2));
    candidates.add(word.slice(0, -1));
  }

  if (word.endsWith("ing") && word.length > 4) {
    candidates.add(word.slice(0, -3));
    candidates.add(`${word.slice(0, -3)}e`);
  }

  return [...candidates];
}

async function fetchDefinition(candidateWord, requestedWord) {
  const response = await fetch(`${API_BASE_URL}${encodeURIComponent(candidateWord)}`);

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  if (!Array.isArray(payload) || payload.length === 0) {
    return null;
  }

  const entry = payload[0];
  const primaryMeaning = entry.meanings?.find((meaning) => meaning.definitions?.length);
  const primaryDefinition = primaryMeaning?.definitions?.[0];
  const phoneticEntry = entry.phonetics?.find((item) => item?.text);
  const synonym = primaryDefinition?.synonyms?.[0] ?? primaryMeaning?.synonyms?.[0] ?? null;

  if (!primaryMeaning || !primaryDefinition?.definition) {
    return null;
  }

  return {
    word: candidateWord,
    requestedWord,
    found: true,
    shortDefinition: primaryDefinition.definition,
    partOfSpeech: primaryMeaning.partOfSpeech ?? null,
    pronunciation: phoneticEntry?.text ?? entry.phonetic ?? null,
    synonym
  };
}

async function readCachedDefinition(word) {
  const cacheKey = `${CACHE_PREFIX}${word}`;
  const storedValue = await chrome.storage.local.get(cacheKey);
  const cachedEntry = storedValue[cacheKey];

  if (!cachedEntry) {
    return null;
  }

  if (Date.now() - cachedEntry.cachedAt > CACHE_TTL_MS) {
    await chrome.storage.local.remove(cacheKey);
    return null;
  }

  return cachedEntry.value;
}

async function writeCachedDefinition(word, value) {
  const cacheKey = `${CACHE_PREFIX}${word}`;

  await chrome.storage.local.set({
    [cacheKey]: {
      cachedAt: Date.now(),
      value
    }
  });
}
