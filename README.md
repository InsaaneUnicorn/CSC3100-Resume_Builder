# ResumeCraft

ResumeCraft is a local Electron resume builder. It uses plain HTML, CSS, and JavaScript on the frontend, an Express REST APIs in the Electron main process, and SQLite for local data storage.

## Baseline Features

- Single-page Electron desktop app with a branded ResumeCraft interface.
- SQLite-backed profile, jobs, skills, certifications, and awards.
- REST endpoints for profile data, resume entries, settings, and AI suggestions.
- Selectable jobs and individual responsibility bullets for tailored resumes.
- Selectable skill, certification, and award sections.
- Live digital resume preview with print/PDF support.
- Attribution dialog for required library credits.
- Optional Gemini API review flow with the user's own API key.
