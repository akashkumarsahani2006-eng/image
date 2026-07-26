const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DATA_DIR = path.join(__dirname, 'data');
const META_FILE = path.join(DATA_DIR, 'meta.json');

/* ------------------------------------------------------------------ */
/*  Bootstrap: make sure required folders/files exist                 */
/* ------------------------------------------------------------------ */
function ensureDirs() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    console.log('📁 Created uploads/ directory');
  }
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(META_FILE)) {
    fs.writeFileSync(META_FILE, '[]', 'utf-8');
  }
}
ensureDirs();

function readMeta() {
  try {
    const raw = fs.readFileSync(META_FILE, 'utf-8');
    return JSON.parse(raw || '[]');
  } catch (err) {
    console.error('Failed to read metadata file:', err);
    return [];
  }
}

function writeMeta(meta) {
  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2), 'utf-8');
}

/* ------------------------------------------------------------------ */
/*  Upload configuration                                              */
/* ------------------------------------------------------------------ */
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

function sanitizeFilename(name) {
  // Strip any path info and disallow unsafe characters
  return path.basename(name).replace(/[^a-zA-Z0-9._-]/g, '_');
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ALLOWED_EXTENSIONS.includes(ext) ? ext : '';
    const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${safeExt}`;
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const mimeOk = ALLOWED_MIME_TYPES.includes(file.mimetype);
  const extOk = ALLOWED_EXTENSIONS.includes(ext);

  if (mimeOk && extOk) {
    cb(null, true);
  } else {
    cb(new Error('INVALID_FILE_TYPE'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE }
});

/* ------------------------------------------------------------------ */
/*  Middleware                                                        */
/* ------------------------------------------------------------------ */
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

/* ------------------------------------------------------------------ */
/*  GET /api/images — list all images, newest first                   */
/* ------------------------------------------------------------------ */
app.get('/api/images', (req, res) => {
  try {
    const meta = readMeta();
    const sorted = [...meta].sort((a, b) => b.uploadedAt - a.uploadedAt);

    const images = sorted
      .filter((item) => fs.existsSync(path.join(UPLOADS_DIR, item.storedName)))
      .map((item) => ({
        filename: item.storedName,
        originalName: item.originalName,
        url: `/uploads/${item.storedName}`,
        size: item.size,
        uploadedAt: item.uploadedAt
      }));

    res.status(200).json({ success: true, images });
  } catch (err) {
    console.error('Error fetching images:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch images' });
  }
});

/* ------------------------------------------------------------------ */
/*  POST /upload — upload one or more images                          */
/* ------------------------------------------------------------------ */
app.post('/upload', (req, res) => {
  upload.array('images', 20)(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ success: false, message: 'File exceeds the 20MB limit' });
        }
        return res.status(400).json({ success: false, message: err.message });
      }
      if (err.message === 'INVALID_FILE_TYPE') {
        return res.status(400).json({
          success: false,
          message: 'Only JPG, PNG, GIF and WEBP images are allowed'
        });
      }
      console.error('Upload error:', err);
      return res.status(500).json({ success: false, message: 'Upload failed' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No files were uploaded' });
    }

    const meta = readMeta();
    const uploaded = [];
    const duplicates = [];

    for (const file of req.files) {
      const originalName = sanitizeFilename(file.originalname);
      const isDuplicate = meta.some(
        (item) => item.originalName === originalName && item.size === file.size
      );

      if (isDuplicate) {
        fs.unlink(file.path, () => {}); // remove the just-saved duplicate
        duplicates.push(originalName);
        continue;
      }

      const record = {
        storedName: file.filename,
        originalName,
        size: file.size,
        mimetype: file.mimetype,
        uploadedAt: Date.now()
      };

      meta.push(record);
      uploaded.push({
        filename: record.storedName,
        originalName: record.originalName,
        url: `/uploads/${record.storedName}`,
        size: record.size,
        uploadedAt: record.uploadedAt
      });
    }

    writeMeta(meta);

    res.status(201).json({
      success: true,
      uploaded,
      duplicates,
      message: `${uploaded.length} image(s) uploaded${
        duplicates.length ? `, ${duplicates.length} duplicate(s) skipped` : ''
      }`
    });
  });
});

/* ------------------------------------------------------------------ */
/*  DELETE /delete/:filename                                          */
/* ------------------------------------------------------------------ */
app.delete('/delete/:filename', (req, res) => {
  try {
    const requested = path.basename(req.params.filename); // prevent path traversal
    const meta = readMeta();
    const index = meta.findIndex((item) => item.storedName === requested);

    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Image not found' });
    }

    const filePath = path.join(UPLOADS_DIR, requested);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    meta.splice(index, 1);
    writeMeta(meta);

    res.status(200).json({ success: true, message: 'Image deleted' });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete image' });
  }
});

/* ------------------------------------------------------------------ */
/*  Frontend fallback + error handlers                                */
/* ------------------------------------------------------------------ */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`✅ Image Share server running at http://localhost:${PORT}`);
});
