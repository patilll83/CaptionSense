const PROVIDERS = [
  {
    id: "youtube",
    matches: () => location.hostname.includes("youtube.com"),
    rootSelector: ".ytp-caption-window-container",
    segmentSelector: ".ytp-caption-segment"
  }
];

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

bootstrap();

function bootstrap() {
  activeProvider = PROVIDERS.find((provider) => provider.matches());

  if (!activeProvider) {
    return;
  }

  document.documentElement.classList.add("captionsense-enabled");
  document.body.appendChild(tooltip);

  observeDocumentForSubtitles();
  attachHoverListeners();
  connectToSubtitleRoot();
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
  const nextRoot = document.querySelector(activeProvider.rootSelector);

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

  const segments = subtitleRoot.querySelectorAll(activeProvider.segmentSelector);

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
  document.addEventListener("scroll", hideTooltip, true);
}

function onPointerOver(event) {
  const wordNode = event.target instanceof Element ? event.target.closest(".captionsense-word") : null;

  if (!wordNode) {
    return;
  }

  showTooltip(wordNode);
}

function onPointerMove(event) {
  if (!hoverState.activeWord) {
    return;
  }

  positionTooltip(hoverState.activeWord, event.clientX, event.clientY);
}

function onPointerOut(event) {
  if (!hoverState.activeWord) {
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

function showTooltip(wordNode) {
  hoverState.activeWord = wordNode;
  hoverState.requestId += 1;

  const currentRequestId = hoverState.requestId;
  const rawWord = wordNode.dataset.word ?? wordNode.textContent ?? "";

  tooltip.classList.add("is-visible");
  tooltip.querySelector("[data-role='word']").textContent = rawWord;
  tooltip.querySelector("[data-role='meta']").textContent = "Loading definition...";
  tooltip.querySelector("[data-role='definition']").textContent = "";
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

      renderLookupResult(response.result);
    }
  );
}

function renderLookupResult(result) {
  const metaParts = [];

  if (result.partOfSpeech) {
    metaParts.push(result.partOfSpeech);
  }

  tooltip.querySelector("[data-role='word']").textContent = result.requestedWord ?? result.word;
  tooltip.querySelector("[data-role='meta']").textContent = metaParts.join(" | ") || "Quick definition";
  tooltip.querySelector("[data-role='definition']").textContent = result.shortDefinition;
}

function renderLookupError(message) {
  tooltip.querySelector("[data-role='meta']").textContent = "Definition unavailable";
  tooltip.querySelector("[data-role='definition']").textContent = message;
}

function hideTooltip() {
  hoverState.activeWord = null;
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
    <div class="captionsense-tooltip__word" data-role="word"></div>
    <div class="captionsense-tooltip__meta" data-role="meta"></div>
    <div class="captionsense-tooltip__definition" data-role="definition"></div>
  `;
  return element;
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
