import express from 'express';
import multer from 'multer';
import cors from 'cors';
import { nanoid } from 'nanoid';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// DATA_DIR lets a host mount a persistent disk (e.g. Render /data, Railway volume).
// Defaults to ./server for local dev.
const DATA_DIR = process.env.DATA_DIR || __dirname;
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_PATH = path.join(DATA_DIR, 'db.json');
const PORT = process.env.PORT || 4000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'deciops2026';

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ---- tiny JSON db ----
function loadDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    return { links: [] };
  }
}
function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// ---- auth ----
function requireAuth(req, res, next) {
  const pw = req.headers['x-admin-password'];
  if (pw !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// ---- upload ----
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.mp4';
    cb(null, `${nanoid()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2GB
});

const app = express();
// Restrict to the frontend origin in prod via CORS_ORIGIN (comma-separated).
// Defaults to open for local/demo use.
const CORS_ORIGIN = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim())
  : true;
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

// Health check (used by host platform) + storage diagnostics.
app.get('/api/health', (req, res) => {
  let writable = false;
  try {
    const probe = path.join(UPLOAD_DIR, '.write-probe');
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    writable = true;
  } catch {
    writable = false;
  }
  let uploadCount = 0;
  try {
    uploadCount = fs.readdirSync(UPLOAD_DIR).filter((f) => !f.startsWith('.')).length;
  } catch {
    uploadCount = -1;
  }
  res.json({
    ok: true,
    dataDir: DATA_DIR,
    persistent: DATA_DIR === '/data', // true only when the disk env is in effect
    uploadDir: UPLOAD_DIR,
    uploadDirWritable: writable,
    uploadCount,
  });
});

// Admin login check
app.post('/api/login', (req, res) => {
  if (req.body?.password === ADMIN_PASSWORD) return res.json({ ok: true });
  return res.status(401).json({ error: 'Invalid password' });
});

// Create link: upload video + text
app.post('/api/links', requireAuth, upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No video uploaded' });
  const db = loadDB();
  const link = {
    id: nanoid(10),
    token: nanoid(16),
    title: req.body.title?.trim() || 'Untitled',
    description: req.body.description?.trim() || '',
    filename: req.file.filename,
    originalName: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
    revoked: false,
    createdAt: new Date().toISOString(),
    views: 0,
  };
  db.links.unshift(link);
  saveDB(db);
  res.json(link);
});

// List all links (admin)
app.get('/api/links', requireAuth, (req, res) => {
  const db = loadDB();
  res.json(db.links);
});

// Revoke / un-revoke
app.patch('/api/links/:id', requireAuth, (req, res) => {
  const db = loadDB();
  const link = db.links.find((l) => l.id === req.params.id);
  if (!link) return res.status(404).json({ error: 'Not found' });
  if (typeof req.body.revoked === 'boolean') link.revoked = req.body.revoked;
  saveDB(db);
  res.json(link);
});

// Delete link + file
app.delete('/api/links/:id', requireAuth, (req, res) => {
  const db = loadDB();
  const link = db.links.find((l) => l.id === req.params.id);
  if (!link) return res.status(404).json({ error: 'Not found' });
  try {
    fs.unlinkSync(path.join(UPLOAD_DIR, link.filename));
  } catch {
    /* file may already be gone */
  }
  db.links = db.links.filter((l) => l.id !== req.params.id);
  saveDB(db);
  res.json({ ok: true });
});

// Public: view metadata by token
app.get('/api/view/:token', (req, res) => {
  const db = loadDB();
  const link = db.links.find((l) => l.token === req.params.token);
  if (!link) return res.status(404).json({ error: 'not_found' });
  if (link.revoked) return res.status(403).json({ error: 'revoked' });
  res.json({ title: link.title, description: link.description, token: link.token });
});

// Public: register one view (called once per viewer session by the client)
app.post('/api/view/:token/hit', (req, res) => {
  const db = loadDB();
  const link = db.links.find((l) => l.token === req.params.token);
  if (!link || link.revoked) return res.status(404).end();
  link.views = (link.views || 0) + 1;
  saveDB(db);
  res.json({ views: link.views });
});

// Public: stream video by token (with HTTP range support for seeking)
app.get('/api/stream/:token', (req, res) => {
  const db = loadDB();
  const link = db.links.find((l) => l.token === req.params.token);
  if (!link || link.revoked) return res.status(403).end();

  // Block direct navigation (open-in-tab / Save As). Media playback sends
  // Sec-Fetch-Dest: video|audio|empty; a document load means someone pasted
  // the URL into the address bar to download it.
  const dest = req.headers['sec-fetch-dest'];
  if (dest === 'document') return res.status(403).end();

  const filePath = path.join(UPLOAD_DIR, link.filename);
  if (!fs.existsSync(filePath)) return res.status(404).end();

  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Cache-Control', 'no-store');

  const stat = fs.statSync(filePath);
  const total = stat.size;
  const range = req.headers.range;
  const type = link.mimetype || 'video/mp4';

  if (range) {
    const match = /bytes=(\d+)-(\d*)/.exec(range);
    const start = parseInt(match[1], 10);
    const end = match[2] ? parseInt(match[2], 10) : total - 1;
    const chunkSize = end - start + 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': type,
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': total,
      'Content-Type': type,
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

app.listen(PORT, () => {
  console.log(`DeciOps demo server on http://localhost:${PORT}`);
});
