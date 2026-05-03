const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();

if (require('electron-squirrel-startup')) {
  app.quit();
}

const API_PORT = 8000;
let db;

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

function get(sql, params = []) {
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

function all(sql, params = []) {
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

async function initializeDatabase() {
  const dbPath = path.join(app.getPath('userData'), 'resume-builder.sqlite');
  db = new sqlite3.Database(dbPath);

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

  await run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`);

  await run(`INSERT OR IGNORE INTO profile (id, fullName, headline, email, phone, location, website, summary)
    VALUES (1, '', '', '', '', '', '', '')`);

  await removeSampleSeedData();
}

async function removeSampleSeedData() {
  const sampleTitles = [
    'Student Web Developer',
    'Frontend Development',
    'Responsive Web Design',
    'Dean\'s List',
  ];

  for (const title of sampleTitles) {
    await run('DELETE FROM entries WHERE title = ?', [title]);
  }

  const profile = await get('SELECT * FROM profile WHERE id = 1');
  if (
    profile.fullName === 'Jordan Student'
    && profile.email === 'student@example.com'
    && profile.phone === '(555) 123-4567'
  ) {
    await run(`UPDATE profile
      SET fullName = '', headline = '', email = '', phone = '', location = '', website = '', summary = ''
      WHERE id = 1`);
  }
}

function parseEntry(row) {
  return {
    ...row,
    isSelected: Boolean(row.isSelected),
    details: JSON.parse(row.details || '[]'),
    selectedDetails: JSON.parse(row.selectedDetails || '[]'),
  };
}

function cleanDetails(details) {
  if (Array.isArray(details)) {
    return details.map((detail) => String(detail).trim()).filter(Boolean);
  }

  return String(details || '')
    .split('\n')
    .map((detail) => detail.trim())
    .filter(Boolean);
}

function createApiServer() {
  const server = express();
  server.use(cors({ origin: '*' }));
  server.use(express.json({ limit: '1mb' }));

  server.get('/api/health', (request, response) => {
    response.json({ ok: true, app: 'ResumeCraft API' });
  });

  server.get('/api/profile', async (request, response) => {
    response.json(await get('SELECT * FROM profile WHERE id = 1'));
  });

  server.put('/api/profile', async (request, response) => {
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
    response.json(await get('SELECT * FROM profile WHERE id = 1'));
  });

  server.get('/api/entries', async (request, response) => {
    const rows = await all('SELECT * FROM entries ORDER BY type, createdAt DESC, id DESC');
    response.json(rows.map(parseEntry));
  });

  server.post('/api/entries', async (request, response) => {
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
    const row = await get('SELECT * FROM entries WHERE id = ?', [result.id]);
    response.status(201).json(parseEntry(row));
  });

  server.put('/api/entries/:id', async (request, response) => {
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
    const row = await get('SELECT * FROM entries WHERE id = ?', [request.params.id]);
    response.json(parseEntry(row));
  });

  server.delete('/api/entries/:id', async (request, response) => {
    await run('DELETE FROM entries WHERE id = ?', [request.params.id]);
    response.status(204).send();
  });

  server.get('/api/settings', async (request, response) => {
    const rows = await all('SELECT key, value FROM settings');
    const settings = {};
    rows.forEach((row) => {
      settings[row.key] = row.key === 'geminiApiKey' && row.value ? 'saved' : row.value;
    });
    response.json(settings);
  });

  server.put('/api/settings/gemini-key', async (request, response) => {
    await run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [
      'geminiApiKey',
      request.body.geminiApiKey || '',
    ]);
    response.json({ geminiApiKey: request.body.geminiApiKey ? 'saved' : '' });
  });

  server.post('/api/suggestions', async (request, response) => {
    const { text, context } = request.body;
    const savedKey = await get('SELECT value FROM settings WHERE key = ?', ['geminiApiKey']);
    const apiKey = savedKey && savedKey.value;

    if (!apiKey) {
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
      const prompt = `Review this resume content for a ${context || 'student resume'}. Return 3 concise improvement suggestions as plain text bullets.\n\n${text}`;
      const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      });

      if (!geminiResponse.ok) {
        throw new Error(`Gemini request failed with ${geminiResponse.status}`);
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

  return server.listen(API_PORT, () => {
    console.log(`ResumeCraft API running on http://localhost:${API_PORT}`);
  });
}

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1040,
    minHeight: 720,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
};

app.whenReady().then(async () => {
  await initializeDatabase();
  createApiServer();
  createWindow();

  ipcMain.handle('print-resume', async (event) => {
    const webContents = event.sender;
    return new Promise((resolve) => {
      webContents.print({ printBackground: true }, (success, failureReason) => {
        resolve({ success, failureReason });
      });
    });
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  if (!app.isAccessibilitySupportEnabled()) {
    app.setAccessibilitySupportEnabled(true);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
