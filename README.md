# CaptionSense

CaptionSense is a Chrome extension MVP that lets you hover English subtitle words on YouTube and see a quick meaning without leaving the video.

## Demo

![CaptionSense hover definition demo](assets/captionsense-demo.png)

## Why this exists

When a movie, series, or YouTube video uses a difficult word in the captions, most people have to pause, pick up their phone, search the word, and then return to the video. CaptionSense keeps that learning moment inside the player by showing the meaning right on hover.

## What this version does

- Watches YouTube subtitle segments as they update
- Wraps subtitle words so they can be hovered
- Shows a compact tooltip with:
  - the word
  - part of speech
  - one quick definition
- Caches definitions in extension storage for faster repeat lookups

## Current limits

- Only targets YouTube for now
- Only works well with English word tokens
- Uses `dictionaryapi.dev`, so network availability matters
- Does not yet support phrase meanings, saved words, or AI explanations

## Load it in Chrome

1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. Click **Load unpacked**
4. Select this folder:
   `C:\Users\vijay\Documents\New project`

## How to test it

1. Open a YouTube video with captions available
2. Turn captions on
3. Hover a word in the subtitle line
4. Wait for the tooltip to show the meaning

## Suggested next steps

- Add phrase-level detection for phrasal verbs and idioms
- Add a saved-words panel
- Support more subtitle providers beyond YouTube
- Add optional AI-powered "explain this subtitle simply" mode
