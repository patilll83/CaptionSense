# CaptionSense

[![Status](https://img.shields.io/badge/status-MVP-1f7a5a)](https://github.com/patilll83/CaptionSense)
[![Platform](https://img.shields.io/badge/platform-Chrome-fbbc05)](https://www.google.com/chrome/)
[![Focus](https://img.shields.io/badge/focus-YouTube%20captions-20232a)](https://www.youtube.com/)

CaptionSense is a Chrome extension that helps you understand difficult subtitle words without pausing the video or opening a second device.

Hover a word in the captions, and CaptionSense shows a quick meaning right inside the player.

## Demo

![CaptionSense hover definition demo showing a definition tooltip over YouTube subtitles](assets/captionsense-demo.png)

## The idea

When people watch movies, series, interviews, or lectures, captions often contain unfamiliar words. The usual flow is slow and distracting:

1. Pause the video
2. Pick up the phone
3. Search the word
4. Return to the video

CaptionSense removes that interruption by bringing the meaning directly to the subtitle line.

## Current MVP

- Works on YouTube, Netflix, and JioHotstar (JioHotstar support is best-effort — see [Limitations](#limitations))
- Hoverable English subtitle words
- Instant tooltip with pronunciation, word type, a short meaning, and a synonym when available
- Click a word to pin its tooltip open; press `Esc` or click elsewhere to close it
- Save words from the tooltip (☆) and review them from the popup
- On/off toggle in the popup, so you can silence tooltips without removing the extension
- Dictionary lookups powered by `dictionaryapi.dev`
- Local caching for faster repeated lookups

## How it works

1. A content script watches YouTube subtitle updates.
2. Each subtitle line is split into hoverable word spans.
3. When you hover a word, the extension asks the background worker for a meaning.
4. The background worker fetches the definition and caches it in browser storage.
5. The tooltip appears beside the subtitle without leaving the video.

## Why this is useful

- Keeps the learning moment inside the video
- Reduces context switching
- Makes subtitle-based vocabulary learning feel natural
- Creates a path toward phrase explanations, saved words, and AI-assisted simplification

## Installation

1. Download or clone this repository.
2. Open Chrome and go to `chrome://extensions`.
3. Turn on `Developer mode`.
4. Click `Load unpacked`.
5. Select the project folder.

## How to try it

1. Open a YouTube video with English captions.
2. Turn captions on.
3. Hover a subtitle word.
4. Read the definition in the tooltip.

## Project scope right now

- Target platforms: YouTube, Netflix, JioHotstar
- Supported input: English subtitle words
- Definition source: `dictionaryapi.dev`
- Interaction model: hover for a quick peek, click to pin, star to save

## Limitations

- Does not yet explain phrases or idioms
- JioHotstar selectors are best-effort (its subtitle DOM isn't publicly documented). If tooltips don't appear there, inspect a caption line in devtools and update the `jiohotstar` entry in `content.js`'s `PROVIDERS` list
- Assumes subtitle text is available in the page DOM
- Depends on network access for first-time word lookups

## Next steps

- Phrase-level detection for phrasal verbs and idioms
- Spaced-repetition review mode for saved words
- Support for more subtitle providers (Prime Video, Disney+)
- Optional AI mode for subtitle simplification and phrase explanation

## Tech

- Manifest V3 Chrome extension
- Vanilla JavaScript
- Content script plus background service worker
- Chrome local storage for caching
