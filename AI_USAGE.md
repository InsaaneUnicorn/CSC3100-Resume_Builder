# Generative AI Usage Documentation

## How AI Was Used

Generative AI was used to help interpret the CSC3100 final project requirements and scaffold a baseline Electron, Express, SQLite, and vanilla JavaScript implementation. AI assistance focused on project structure, REST route design, resume preview behavior, print styling, accessibility-minded markup, and documentation.

## AI-Generated or AI-Assisted Code Areas

- `src/index.js`: Electron main process, Express REST API, SQLite setup, Gemini suggestion endpoint.
- `src/index.html`: Single-page application structure and accessible form markup.
- `src/index.css`: Responsive layout, resume preview styling, and print styles.
- `src/render.js`: Frontend state management, CRUD interactions, live preview rendering, and AI review UI.
- `src/preload.js`: Safe Electron bridge for printing.

## Rules and Agent Files

- Project agent instructions are documented in `AGENTS.md`.
- The implementation follows the assignment requirement to use HTML, CSS, JavaScript, Electron, Express, and SQLite without React, MVC, or SSR.

## MCP Server Details

No project-specific MCP server is required to run the app. The development assistant used local file and shell tooling available in the Codex environment.

## Gemini API Configuration

The app does not include a developer API key. Users can paste their own Gemini API key in the AI Review section. That key is stored locally in SQLite through the `/api/settings/gemini-key` endpoint.

When no Gemini key is saved, the app returns local resume-writing suggestions so the UI remains usable during development and demos.

## Privacy Note

Only text entered into the AI Review text box is sent to Gemini, and only when a user has saved their own API key. Resume data remains in the local SQLite database.
