# ResumeCraft

ResumeCraft is a local Electron resume builder for CSC3100. It uses plain HTML, CSS, and JavaScript on the frontend, an Express REST API in the Electron main process, and SQLite for local data storage.

## Run the App

```bash
npm install
npm start
```

## Baseline Features

- Single-page Electron desktop app with a branded ResumeCraft interface.
- SQLite-backed profile, jobs, skills, certifications, and awards.
- REST endpoints for profile data, resume entries, settings, and AI suggestions.
- Selectable jobs and individual responsibility bullets for tailored resumes.
- Selectable skill, certification, and award sections.
- Live digital resume preview with print/PDF support.
- Attribution dialog for required library credits.
- Optional Gemini API review flow with the user's own API key.

## Notes for Submission

- The app stores user data locally in Electron's user data directory.
- No developer API key is included in the project.
- `.env` is already ignored for local development secrets.
- Authentication and login are intentionally not implemented yet.
- Run a Lighthouse accessibility test before final submission and include the score documentation with the ZIP.

## Repository Link

Add your public GitHub repository URL here before submission.

## Sharing Statement

Add your statement here indicating whether your project may be shared with other students.
