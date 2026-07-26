# PixelDrop — Image Sharing Website

A production-ready image sharing website built with Node.js, Express, and vanilla HTML/CSS/JavaScript. Features a glassmorphism UI, drag-and-drop uploads, a live-refreshing masonry gallery, and a fullscreen zoomable viewer.

## Features

- 🎨 Modern glassmorphism UI with dark/light mode and animated gradient background
- 📤 Drag & drop or click-to-upload, with multi-file support and live previews
- 📊 Real-time upload progress bar
- 🚫 Duplicate prevention (by filename + file size)
- 🖼️ Masonry-style responsive gallery with lazy-loaded images
- 🔍 Fullscreen viewer with click-to-zoom
- 🗑️ Delete images with a confirmation dialog
- 🔄 Gallery auto-refreshes every 3 seconds — no reload needed
- 🔔 Toast notifications for success/error states
- 🔒 Server-side MIME/extension validation, file size limits, and path-traversal protection

## Installation

```bash
npm install
```

## Run

```bash
npm start
```

For development with auto-restart on file changes:

```bash
npm run dev
```

Then open **http://localhost:3000** in your browser.

## Project Structure

```
image-share/
│
├── package.json
├── server.js
├── uploads/          # created automatically — stores uploaded images
├── data/
│   └── meta.json      # created automatically — image metadata index
├── public/
│   ├── index.html
│   ├── style.css
│   └── script.js
└── README.md
```

## API Documentation

### `GET /api/images`
Returns all uploaded images, sorted newest first.

**Response `200`**
```json
{
  "success": true,
  "images": [
    {
      "filename": "1706182200000-a1b2c3d4.jpg",
      "originalName": "sunset.jpg",
      "url": "/uploads/1706182200000-a1b2c3d4.jpg",
      "size": 245120,
      "uploadedAt": 1706182200000
    }
  ]
}
```

### `POST /upload`
Uploads one or more images. Field name: `images` (accepts multiple files).

- Accepted types: `jpg`, `jpeg`, `png`, `gif`, `webp`
- Max size: 20MB per file
- Max files per request: 20
- Duplicate files (same original filename + size) are skipped automatically

**Response `201`**
```json
{
  "success": true,
  "uploaded": [ { "filename": "...", "originalName": "...", "url": "...", "size": 0, "uploadedAt": 0 } ],
  "duplicates": ["duplicate-file.jpg"],
  "message": "2 image(s) uploaded, 1 duplicate(s) skipped"
}
```

**Error responses:** `400` (invalid type / too large / no files), `500` (server error)

### `DELETE /delete/:filename`
Deletes the specified image (server-generated filename, not the original name).

**Response `200`**
```json
{ "success": true, "message": "Image deleted" }
```

**Error responses:** `404` (not found), `500` (server error)

## Security Notes

- MIME type and extension are both validated against an allowlist
- Filenames are sanitized and re-generated on the server to prevent path traversal
- The `:filename` delete parameter is resolved with `path.basename` to block `../` attacks
- Multer enforces a hard 20MB per-file limit

## Browser Support

Tested in the latest versions of Chrome, Edge, and Firefox. Uses only standard Fetch/XHR APIs, CSS Grid/Columns, and `backdrop-filter` — no external JS frameworks.
