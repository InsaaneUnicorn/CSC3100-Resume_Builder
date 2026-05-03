// Electron main process: Entry point for the desktop app
// Loads Electron, Express (for API), CORS, and SQLite3 for local DB
const { app, BrowserWindow, ipcMain } = require('electron'); // Electron app and window management
const path = require('node:path'); // Node.js path utilities
const express = require('express'); // Express for local API server
const cors = require('cors'); // CORS for API
const sqlite3 = require('sqlite3').verbose(); // SQLite3 for local database

// Handle Windows installer events (Squirrel)
if (require('electron-squirrel-startup')) {
  app.quit();
}

// Port for the local API server
const BACKEND_PORT = 8000;
// Database connection (set in initializeDatabase)
let db;


// Helper: Run a SQL statement (INSERT/UPDATE/DELETE)
/**
 * Executes an SQLite SQL statement (INSERT, UPDATE, DELETE) and returns the result.
 * @param {string} sql - The SQL query string to execute.
 * @param {Array} params - Array of parameters to bind to the query.
 * @returns {Promise<Object>} A promise resolving to an object with the `id` (last inserted ID) and `changes` (rows affected).
 */
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) {
        reject(error);
        return;
      }
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}


// Helper: Get a single row from the database
/**
 * Executes a SELECT query to retrieve a single row from the database.
 * @param {string} sql - The SQL query string.
 * @param {Array} params - Array of parameters to bind to the query.
 * @returns {Promise<Object|undefined>} A promise resolving to the row object, or undefined if not found.
 */
function getRow(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(row);
    });
  });
}


// Helper: Get all rows from the database
/**
 * Executes a SELECT query to retrieve multiple rows from the database.
 * @param {string} sql - The SQL query string.
 * @param {Array} params - Array of parameters to bind to the query.
 * @returns {Promise<Object[]>} A promise resolving to an array of row objects.
 */
function getAllRows(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(rows);
    });
  });
}


// Initialize the SQLite database and create tables if they don't exist
// This is called once when the app starts
/**
 * Initializes the SQLite database, creating necessary tables (`profile`, `entries`, `settings`) if they do not exist.
 * It also seeds the database with a default empty profile.
 * Takes no inputs.
 */
async function initializeDatabase() {
  // Store DB in Electron's userData directory
  const dbPath = path.join(app.getPath('userData'), 'resume-builder.sqlite');
  db = new sqlite3.Database(dbPath);

  // User profile table (single row)
  await run(`CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    fullName TEXT DEFAULT '',
    headline TEXT DEFAULT '',
    email TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    location TEXT DEFAULT '',
    website TEXT DEFAULT '',
    summary TEXT DEFAULT ''
  )`);

  // Resume entries (jobs, skills, etc.)
  await run(`CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    organization TEXT DEFAULT '',
    category TEXT DEFAULT '',
    location TEXT DEFAULT '',
    startDate TEXT DEFAULT '',
    endDate TEXT DEFAULT '',
    details TEXT NOT NULL DEFAULT '[]',
    selectedDetails TEXT NOT NULL DEFAULT '[]',
    isSelected INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  // App settings (e.g., Gemini API key)
  await run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`);

  // Ensure a default profile row exists
  await run(`INSERT OR IGNORE INTO profile (id, fullName, headline, email, phone, location, website, summary)
    VALUES (1, '', '', '', '', '', '', '')`);
}

// Convert DB row to JS object, parsing JSON fields
/**
 * Converts a raw SQLite row for an entry into a JavaScript object, parsing its JSON fields.
 * @param {Object} row - The raw database row.
 * @returns {Object} The parsed entry object with `details` and `selectedDetails` as arrays.
 */
function parseEntry(row) {
  return {
    ...row,
    isSelected: Boolean(row.isSelected),
    details: JSON.parse(row.details || '[]'),
    selectedDetails: JSON.parse(row.selectedDetails || '[]'),
  };
}

// Normalize details: always return array of trimmed strings
/**
 * Normalizes an array or newline-separated string of details into an array of clean, trimmed strings.
 * @param {string|string[]} details - The raw details data.
 * @returns {string[]} An array of trimmed, non-empty detail strings.
 */
function cleanDetails(details) {
  if (Array.isArray(details)) {
    return details.map((detail) => String(detail).trim()).filter(Boolean);
  }

  return String(details || '')
    .split('\n')
    .map((detail) => detail.trim())
    .filter(Boolean);
}


// Set up the Express API server for the renderer/frontend to call
// This is how the UI (render.js) interacts with the database
/**
 * Sets up and starts the Express API server on the local port. Defines all REST endpoints 
 * for the renderer process to interact with the database and the Gemini AI service.
 * Takes no inputs.
 * @returns {http.Server} The running Express server instance.
 */
function createApiRoutes() {
  const server = express();
  server.use(cors({ origin: '*' })); // Allow all origins (for Electron local use)
  server.use(express.json({ limit: '1mb' })); // Parse JSON bodies

  // --- Profile Endpoints ---
  // Get profile
  server.get('/profile', async (request, response) => {
    response.json(await getRow('SELECT * FROM profile WHERE id = 1'));
  });
  // Update profile
  server.put('/profile', async (request, response) => {
    const profile = request.body;
    await run(
      `UPDATE profile SET fullName = ?, headline = ?, email = ?, phone = ?, location = ?, website = ?, summary = ? WHERE id = 1`,
      [
        profile.fullName || '',
        profile.headline || '',
        profile.email || '',
        profile.phone || '',
        profile.location || '',
        profile.website || '',
        profile.summary || '',
      ],
    );
    response.json(await getRow('SELECT * FROM profile WHERE id = 1'));
  });

  // --- Entries Endpoints ---
  // Get all entries (jobs, skills, etc.)
  server.get('/entries', async (request, response) => {
    const rows = await getAllRows('SELECT * FROM entries ORDER BY type, createdAt DESC, id DESC');
    response.json(rows.map(parseEntry));
  });
  // Add new entry
  server.post('/entries', async (request, response) => {
    const entry = request.body;
    const details = cleanDetails(entry.details);
    const selectedDetails = cleanDetails(entry.selectedDetails || details);
    const result = await run(
      `INSERT INTO entries (type, title, organization, category, location, startDate, endDate, details, selectedDetails, isSelected)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.type,
        entry.title || 'Untitled item',
        entry.organization || '',
        entry.category || '',
        entry.location || '',
        entry.startDate || '',
        entry.endDate || '',
        JSON.stringify(details),
        JSON.stringify(selectedDetails),
        entry.isSelected === false ? 0 : 1,
      ],
    );
    const row = await getRow('SELECT * FROM entries WHERE id = ?', [result.id]);
    response.status(201).json(parseEntry(row));
  });
  // Update entry
  server.put('/entries/:id', async (request, response) => {
    const entry = request.body;
    const details = cleanDetails(entry.details);
    const selectedDetails = cleanDetails(entry.selectedDetails || details);
    await run(
      `UPDATE entries
       SET type = ?, title = ?, organization = ?, category = ?, location = ?, startDate = ?, endDate = ?,
           details = ?, selectedDetails = ?, isSelected = ?, updatedAt = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        entry.type,
        entry.title || 'Untitled item',
        entry.organization || '',
        entry.category || '',
        entry.location || '',
        entry.startDate || '',
        entry.endDate || '',
        JSON.stringify(details),
        JSON.stringify(selectedDetails),
        entry.isSelected === false ? 0 : 1,
        request.params.id,
      ],
    );
    const row = await getRow('SELECT * FROM entries WHERE id = ?', [request.params.id]);
    response.json(parseEntry(row));
  });
  // Delete entry
  server.delete('/entries/:id', async (request, response) => {
    await run('DELETE FROM entries WHERE id = ?', [request.params.id]);
    response.status(204).send();
  });

  // --- Settings Endpoints ---
  // Get all settings
  server.get('/settings', async (request, response) => {
    const rows = await getAllRows('SELECT key, value FROM settings');
    const settings = {};
    rows.forEach((row) => {
      settings[row.key] = row.key === 'geminiApiKey' && row.value ? 'saved' : row.value;
    });
    response.json(settings);
  });
  // Save Gemini API key
  server.put('/settings/gemini-key', async (request, response) => {
    await run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [
      'geminiApiKey',
      request.body.geminiApiKey || '',
    ]);
    response.json({ geminiApiKey: request.body.geminiApiKey ? 'saved' : '' });
  });

  // --- AI Suggestions Endpoint ---
  // POST /suggestions: Calls Gemini API if key is set, else returns local suggestions
  server.post('/suggestions', async (request, response) => {
    const { text, context } = request.body;
    const savedKey = await getRow('SELECT value FROM settings WHERE key = ?', ['geminiApiKey']);
    const apiKey = savedKey && savedKey.value;

    if (!apiKey) {
      // No API key: return local suggestions
      response.json({
        source: 'local',
        suggestions: [
          'Start with an action verb and name the specific result.',
          'Add a metric such as percentage, quantity, frequency, or audience size when possible.',
          'Keep each bullet to one strong accomplishment instead of several small tasks.',
        ],
      });
      return;
    }

    try {
      // Call Gemini API for suggestions
      const prompt = `I'm applying for jobs and I would like my resume reviewed and tailored  for this job I'm applying to. ${context}. Return 3 concise improvement suggestions as plain text bullets. Do not use any markdown formatting like bold, italics, or code blocks.\n\n${text}\n\n${text}`;
      const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      });

      if (!geminiResponse.ok) {
        const errorText = await geminiResponse.text();
        console.error('Gemini API Error:', errorText);
        throw new Error(`Gemini request failed with ${geminiResponse.status}: ${errorText}`);
      }

      const data = await geminiResponse.json();
      const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      response.json({
        source: 'gemini',
        suggestions: textResponse
          .split('\n')
          .map((line) => line.replace(/^[-*]\s*/, '').trim())
          .filter(Boolean)
          .slice(0, 5),
      });
    } catch (error) {
      response.status(502).json({
        source: 'error',
        message: 'Unable to reach Gemini. Check the API key and network connection.',
        details: error.message,
      });
    }
  });

  // Start the API server
  return server.listen(BACKEND_PORT, () => {
    console.log(`ResumeCraft API running on http://localhost:${BACKEND_PORT}`);
  });
}


// Create the main Electron window and load the frontend
// The renderer process (render.js) runs in this window
/**
 * Creates the main Electron browser window, configures security preferences (preload scripts, context isolation), 
 * and loads the frontend `index.html`.
 * Takes no inputs.
 */
const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1040, // Minimum window size
    minHeight: 720,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), // Preload script for contextBridge
      nodeIntegration: false, // Security: no node in renderer
      contextIsolation: true, // Security: isolate context
    },
  });

  // Load the HTML UI
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
};


// Main app startup: initialize DB, API, and window
app.whenReady().then(async () => {
  await initializeDatabase(); // Set up SQLite
  createApiRoutes(); // Start API server
  createWindow(); // Open Electron window

  // Handle print requests from renderer (via preload.js)
  ipcMain.handle('print-resume', async (event) => {
    const webContents = event.sender;
    return new Promise((resolve) => {
      webContents.print({ printBackground: true }, (success, failureReason) => {
        resolve({ success, failureReason });
      });
    });
  });

  // macOS: re-create window if all closed and app is re-activated
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  // Enable accessibility if not already enabled
  if (!app.isAccessibilitySupportEnabled()) {
    app.setAccessibilitySupportEnabled(true);
  }
});


// Quit the app when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});