const PROVIDERS = [
  {
    id: "youtube",
    matches: () => location.hostname.includes("youtube.com"),
    rootSelectors: [".ytp-caption-window-container"],
    segmentSelectors: [".ytp-caption-segment"]
  },
  {
    id: "netflix",
    matches: () => location.hostname.includes("netflix.com"),
    rootSelectors: [".player-timedtext"],
    segmentSelectors: [".player-timedtext-text-container"]
  },
  {
    // Best-effort: JioHotstar doesn't publish stable class names, so we try
    // a few common patterns. If captions stop lighting up here, inspect a
    // subtitle line in devtools and update these selectors.
    id: "jiohotstar",
    matches: () => location.hostname.includes("jiohotstar.com") || location.hostname.includes("hotstar.com"),
    rootSelectors: [
      "[class*='subtitle-cue-window']",
      "[class*='captions-renderer']",
      "[class*='caption-window']",
      "[data-testid*='caption']"
    ],
    segmentSelectors: [
      "[class*='subtitle-cue-window'] [class*='cue']",
      "[class*='captions-renderer'] span",
      "[class*='caption-window'] span",
      "[data-testid*='caption'] span"
    ]
  }
];

const STORAGE_KEYS = {
  enabled: "captionsense:enabled",
  savedWords: "captionsense:savedWords"
};

const WORD_PATTERN = /^[A-Za-z]+(?:'[A-Za-z]+)?$/;
const tooltip = createTooltip();
const hoverState = {
  activeWord: null,
  requestId: 0
};

let activeProvider = null;
let rootObserver = null;
let segmentObserver = null;
let subtitleRoot = null;
let isEnabled = true;
let pinnedWord = null;
let lastLookup = null;

bootstrap();

function bootstrap() {
  activeProvider = PROVIDERS.find((provider) => provider.matches());

  if (!activeProvider) {
    return;
  }

  document.documentElement.classList.add("captionsense-enabled");
  document.body.appendChild(tooltip);

  chrome.storage.local.get(STORAGE_KEYS.enabled).then((stored) => {
    isEnabled = stored[STORAGE_KEYS.enabled] !== false;
    applyEnabledState();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !(STORAGE_KEYS.enabled in changes)) {
      return;
    }

    isEnabled = changes[STORAGE_KEYS.enabled].newValue !== false;
    applyEnabledState();
  });

  observeDocumentForSubtitles();
  attachHoverListeners();
  connectToSubtitleRoot();
}

function applyEnabledState() {
  document.documentElement.classList.toggle("captionsense-disabled", !isEnabled);

  if (!isEnabled) {
    unpinTooltip();
    hideTooltip();
  }
}

function observeDocumentForSubtitles() {
  if (rootObserver) {
    rootObserver.disconnect();
  }

  rootObserver = new MutationObserver(() => connectToSubtitleRoot());
  rootObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function connectToSubtitleRoot() {
  const nextRoot = queryFirst(document, activeProvider.rootSelectors);

  if (!nextRoot || nextRoot === subtitleRoot) {
    if (nextRoot) {
      processSubtitleSegments();
    }
    return;
  }

  subtitleRoot = nextRoot;

  if (segmentObserver) {
    segmentObserver.disconnect();
  }

  segmentObserver = new MutationObserver(() => processSubtitleSegments());
  segmentObserver.observe(subtitleRoot, {
    childList: true,
    characterData: true,
    subtree: true
  });

  processSubtitleSegments();
}

function processSubtitleSegments() {
  if (!subtitleRoot) {
    return;
  }

  const segments = queryAllFirst(subtitleRoot, activeProvider.segmentSelectors);

  for (const segment of segments) {
    const rawText = segment.textContent?.trim();

    if (!rawText) {
      continue;
    }

    if (segment.dataset.captionsenseProcessedText === rawText) {
      continue;
    }

    segment.dataset.captionsenseProcessedText = rawText;
    segment.dataset.captionsenseLine = rawText;
    segment.innerHTML = renderSegmentMarkup(rawText);
  }
}

function queryFirst(root, selectors) {
  for (const selector of selectors) {
    const match = root.querySelector(selector);
    if (match) {
      return match;
    }
  }
  return null;
}

function queryAllFirst(root, selectors) {
  for (const selector of selectors) {
    const matches = root.querySelectorAll(selector);
    if (matches.length) {
      return matches;
    }
  }
  return [];
}

function renderSegmentMarkup(line) {
  const tokens = line.match(/(\s+|[A-Za-z]+(?:'[A-Za-z]+)?|[0-9]+|[^\sA-Za-z0-9]+)/g) ?? [line];
  return tokens
    .map((token) => {
      if (!WORD_PATTERN.test(token)) {
        return escapeHtml(token);
      }

      return `<span class="captionsense-word" data-word="${escapeAttribute(token)}">${escapeHtml(token)}</span>`;
    })
    .join("");
}

function attachHoverListeners() {
  document.addEventListener("pointerover", onPointerOver, true);
  document.addEventListener("pointermove", onPointerMove, true);
  document.addEventListener("pointerout", onPointerOut, true);
  document.addEventListener("click", onDocumentClick, true);
  document.addEventListener("keydown", onDocumentKeydown, true);
  document.addEventListener("scroll", () => {
    if (!pinnedWord) {
      hideTooltip();
    }
  }, true);
}

function onPointerOver(event) {
  if (!isEnabled || pinnedWord) {
    return;
  }

  const wordNode = event.target instanceof Element ? event.target.closest(".captionsense-word") : null;

  if (!wordNode) {
    return;
  }

  showTooltip(wordNode);
}

function onPointerMove(event) {
  if (pinnedWord || !hoverState.activeWord) {
    return;
  }

  positionTooltip(hoverState.activeWord, event.clientX, event.clientY);
}

function onPointerOut(event) {
  if (pinnedWord || !hoverState.activeWord) {
    return;
  }

  const relatedTarget = event.relatedTarget instanceof Element ? event.relatedTarget.closest(".captionsense-word") : null;
  if (relatedTarget === hoverState.activeWord) {
    return;
  }

  const leavingNode = event.target instanceof Element ? event.target.closest(".captionsense-word") : null;
  if (leavingNode === hoverState.activeWord) {
    hideTooltip();
  }
}

function onDocumentClick(event) {
  if (!isEnabled) {
    return;
  }

  const target = event.target instanceof Element ? event.target : null;
  const wordNode = target ? target.closest(".captionsense-word") : null;

  if (wordNode) {
    event.preventDefault();
    event.stopPropagation();
    togglePin(wordNode);
    return;
  }

  if (pinnedWord && !target?.closest(".captionsense-tooltip")) {
    unpinTooltip();
  }
}

function onDocumentKeydown(event) {
  if (event.key === "Escape" && pinnedWord) {
    unpinTooltip();
  }
}

function togglePin(wordNode) {
  if (pinnedWord === wordNode) {
    unpinTooltip();
    return;
  }

  pinnedWord = wordNode;
  tooltip.classList.add("is-pinned");
  showTooltip(wordNode);
}

function unpinTooltip() {
  if (!pinnedWord) {
    return;
  }

  pinnedWord = null;
  tooltip.classList.remove("is-pinned");
  hideTooltip();
}

function showTooltip(wordNode) {
  hoverState.activeWord = wordNode;
  hoverState.requestId += 1;

  const currentRequestId = hoverState.requestId;
  const rawWord = wordNode.dataset.word ?? wordNode.textContent ?? "";

  lastLookup = null;
  tooltip.classList.add("is-visible");
  tooltip.querySelector("[data-role='word']").textContent = rawWord;
  tooltip.querySelector("[data-role='meta']").textContent = "Loading definition...";
  tooltip.querySelector("[data-role='definition']").textContent = "";
  tooltip.querySelector("[data-role='synonym']").textContent = "";
  setSaveButtonState({ visible: false });
  positionTooltip(wordNode);

  chrome.runtime.sendMessage(
    {
      type: "lookup-word",
      word: rawWord
    },
    (response) => {
      if (chrome.runtime.lastError) {
        renderLookupError("Extension lookup is unavailable.");
        return;
      }

      if (currentRequestId !== hoverState.requestId || hoverState.activeWord !== wordNode) {
        return;
      }

      if (!response?.ok || !response.result) {
        renderLookupError(response?.error ?? "Could not load a definition.");
        return;
      }

      renderLookupResult(rawWord, response.result);
    }
  );
}

function renderLookupResult(rawWord, result) {
  const metaParts = [];

  if (result.pronunciation) {
    metaParts.push(result.pronunciation);
  }

  if (result.partOfSpeech) {
    metaParts.push(result.partOfSpeech);
  }

  tooltip.querySelector("[data-role='word']").textContent = result.requestedWord ?? result.word;
  tooltip.querySelector("[data-role='meta']").textContent = metaParts.join(" · ") || "Quick definition";
  tooltip.querySelector("[data-role='definition']").textContent = result.shortDefinition;
  tooltip.querySelector("[data-role='synonym']").textContent = result.synonym ? `Similar: ${result.synonym}` : "";

  if (result.found) {
    lastLookup = { rawWord, result };
    refreshSaveButtonState();
  } else {
    lastLookup = null;
    setSaveButtonState({ visible: false });
  }
}

function renderLookupError(message) {
  tooltip.querySelector("[data-role='meta']").textContent = "Definition unavailable";
  tooltip.querySelector("[data-role='definition']").textContent = message;
  tooltip.querySelector("[data-role='synonym']").textContent = "";
  lastLookup = null;
  setSaveButtonState({ visible: false });
}

function hideTooltip() {
  if (pinnedWord) {
    return;
  }

  hoverState.activeWord = null;
  lastLookup = null;
  tooltip.classList.remove("is-visible");
}

function positionTooltip(wordNode, pointerX, pointerY) {
  const rect = wordNode.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const margin = 14;
  const fallbackWidth = 280;
  const width = tooltipRect.width || fallbackWidth;
  const height = tooltipRect.height || 120;
  const preferredLeft = typeof pointerX === "number" ? pointerX - width / 2 : rect.left + rect.width / 2 - width / 2;
  const preferredTop = typeof pointerY === "number" ? pointerY - height - 18 : rect.top - height - 18;
  const left = clamp(preferredLeft, margin, window.innerWidth - width - margin);
  let top = preferredTop;

  if (top < margin) {
    top = rect.bottom + 18;
  }

  top = clamp(top, margin, window.innerHeight - height - margin);

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function createTooltip() {
  const element = document.createElement("aside");
  element.className = "captionsense-tooltip";
  element.innerHTML = `
    <div class="captionsense-tooltip__header">
      <div class="captionsense-tooltip__word" data-role="word"></div>
      <button type="button" class="captionsense-tooltip__save" data-role="save" title="Save word">☆</button>
    </div>
    <div class="captionsense-tooltip__meta" data-role="meta"></div>
    <div class="captionsense-tooltip__definition" data-role="definition"></div>
    <div class="captionsense-tooltip__synonym" data-role="synonym"></div>
  `;

  element.querySelector("[data-role='save']").addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    handleSaveClick();
  });

  return element;
}

async function handleSaveClick() {
  if (!lastLookup) {
    return;
  }

  const { rawWord, result } = lastLookup;
  const isSaved = await toggleSavedWord(rawWord, result);
  setSaveButtonState({ visible: true, saved: isSaved });
}

async function refreshSaveButtonState() {
  if (!lastLookup) {
    return;
  }

  const normalizedWord = (lastLookup.result.word ?? lastLookup.rawWord).toLowerCase();
  const saved = await isWordSaved(normalizedWord);

  if (lastLookup && normalizedWord === (lastLookup.result.word ?? lastLookup.rawWord).toLowerCase()) {
    setSaveButtonState({ visible: true, saved });
  }
}

function setSaveButtonState({ visible, saved }) {
  const button = tooltip.querySelector("[data-role='save']");
  button.hidden = !visible;

  if (!visible) {
    return;
  }

  button.classList.toggle("is-saved", Boolean(saved));
  button.setAttribute("aria-pressed", saved ? "true" : "false");
  button.title = saved ? "Remove from saved words" : "Save word";
  button.textContent = saved ? "★" : "☆";
}

async function isWordSaved(normalizedWord) {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.savedWords);
  const savedWords = stored[STORAGE_KEYS.savedWords] ?? {};
  return Boolean(savedWords[normalizedWord]);
}

async function toggleSavedWord(rawWord, result) {
  const normalizedWord = (result.word ?? rawWord).toLowerCase();
  const stored = await chrome.storage.local.get(STORAGE_KEYS.savedWords);
  const savedWords = stored[STORAGE_KEYS.savedWords] ?? {};

  if (savedWords[normalizedWord]) {
    delete savedWords[normalizedWord];
  } else {
    savedWords[normalizedWord] = {
      word: rawWord,
      shortDefinition: result.shortDefinition ?? "",
      partOfSpeech: result.partOfSpeech ?? null,
      savedAt: Date.now()
    };
  }

  await chrome.storage.local.set({ [STORAGE_KEYS.savedWords]: savedWords });
  return Boolean(savedWords[normalizedWord]);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
