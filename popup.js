const STORAGE_KEYS = {
  enabled: "captionsense:enabled",
  savedWords: "captionsense:savedWords"
};

const toggleInput = document.getElementById("enabledToggle");
const listEl = document.getElementById("savedWordsList");
const countEl = document.getElementById("savedWordsCount");
const emptyEl = document.getElementById("savedWordsEmpty");

init();

async function init() {
  const stored = await chrome.storage.local.get([STORAGE_KEYS.enabled, STORAGE_KEYS.savedWords]);

  toggleInput.checked = stored[STORAGE_KEYS.enabled] !== false;
  renderSavedWords(stored[STORAGE_KEYS.savedWords] ?? {});

  toggleInput.addEventListener("change", () => {
    chrome.storage.local.set({ [STORAGE_KEYS.enabled]: toggleInput.checked });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && STORAGE_KEYS.savedWords in changes) {
      renderSavedWords(changes[STORAGE_KEYS.savedWords].newValue ?? {});
    }
  });
}

function renderSavedWords(savedWords) {
  const entries = Object.entries(savedWords).sort((a, b) => b[1].savedAt - a[1].savedAt);

  listEl.innerHTML = "";
  countEl.textContent = String(entries.length);
  emptyEl.hidden = entries.length > 0;

  for (const [key, entry] of entries) {
    const item = document.createElement("li");
    item.className = "saved-words__item";
    item.innerHTML = `
      <div class="saved-words__text">
        <p class="saved-words__word">${escapeHtml(entry.word ?? key)}</p>
        <p class="saved-words__meaning">${escapeHtml(entry.shortDefinition ?? "")}</p>
      </div>
      <button type="button" class="saved-words__remove" title="Remove">✕</button>
    `;
    item.querySelector(".saved-words__remove").addEventListener("click", () => removeSavedWord(key));
    listEl.appendChild(item);
  }
}

async function removeSavedWord(key) {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.savedWords);
  const savedWords = stored[STORAGE_KEYS.savedWords] ?? {};
  delete savedWords[key];
  await chrome.storage.local.set({ [STORAGE_KEYS.savedWords]: savedWords });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}
