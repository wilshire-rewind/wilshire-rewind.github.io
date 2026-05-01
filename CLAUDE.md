# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Wilshire Rewind is a static sermon archive website. No build system, no dependencies — plain HTML served directly from `src/`.

## Structure

Each sermon has three companion files, all sharing the same base name:

- `src/audio/<Name>.mp3` — audio recording
- `src/subtitles/<Name>.srt` — SRT subtitle/caption file (timecoded)
- `src/transcriptions/<Name>.txt` — plain-text transcript

The single `src/index.html` is the archive landing page (currently a stub).

## Naming Convention

Sermon files use the pattern `Sermon_MMDDYY` (e.g., `Sermon_101302` = October 13, 2002).

## Build

```
python3 build.py
```

Reads all sermons from `src/audio/`, `src/subtitles/`, and `src/transcriptions/`, then writes:

- `src/sermons.json` — sermon list (id, date, duration, title, speaker, excerpt, URLs) for client-side JS
- `src/transcriptions.json` — `[{id, date, text}]` array of full transcripts for client-side search
- `src/feed.xml` — podcast RSS 2.0 feed with iTunes extensions

Configure site URL and podcast metadata in `config.json` before running.

No dependencies beyond Python 3 stdlib.

## Source Material

`_old-rips/` holds original MP3 rips named `YYYY-MM-DD.mp3`. This directory is gitignored and serves as the raw source before processing into `src/audio/`.
