# Generative AI Usage Documentation

## How AI Was Used

Generative AI was used to help interpret the CSC3100 final project requirements (Help me figure out user stories and actual features of a Resume Builder) and scaffold a baseline Express, SQLite, and vanilla JavaScript implementation. I set up the basic electron parts myself without AI, and with ElectronJS documentation. The only thing I asked AI for was if I should use electron forge and some install/setup instruction questions. AI assistance focused on project structure, REST route design, resume preview behavior, print styling, and some documentation. AI Did help me write most of the comments for my own understanding.

## AI-Generated or AI-Assisted Code Areas

- `src/index.js`: Express REST API, Gemini suggestion endpoint.
- `src/index.html`: Single-page application structure and accessible form markup.
- `src/index.css`: Resume preview styling, and print styles.
- `src/render.js`: Frontend state management, live preview rendering, and AI review UI.
- `src/preload.js`: Safe Electron bridge for printing.

## Rules and Agent Files

- Project agent instructions are documented in `AGENTS.md`.

## MCP Server Details

No project-specific MCP server is required to run the app nor was used. The development assistant used local file and shell tooling available in the Codex environment. I didn't make an mcp server to help me develop this. I just used codex and VSCode Copilot.
