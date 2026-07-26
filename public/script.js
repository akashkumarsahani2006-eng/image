(() => {
  'use strict';

  /* ---------------- DOM refs ---------------- */
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const previewGrid = document.getElementById('previewGrid');
  const uploadControls = document.getElementById('uploadControls');
  const uploadBtn = document.getElementById('uploadBtn');
  const uploadBtnText = document.getElementById('uploadBtnText');
  const clearBtn = document.getElementById('clearBtn');
  const progressWrap = document.getElementById('progressWrap');
  const progressBar = document.getElementById('progressBar');
  const progressLabel = document.getElementById('progressLabel');

  const galleryEl = document.getElementById('gallery');
  const loadingState = document.getElementById('loadingState');
  const emptyState = document.getElementById('emptyState');
  const imageCount = document.getElementById('imageCount');

  const viewerModal = document.getElementById('viewerModal');
  const viewerImage = document.getElementById('viewerImage');
  const viewerClose = document.getElementById('viewerClose');

  const confirmModal = document.getElementById('confirmModal');
  const confirmCancel = document.getElementById('confirmCancel');
  const confirmDelete = document.getElementById('confirmDelete');

  const toastContainer = document.getElementById('toastContainer');
  const themeToggle = document.getElementById('themeToggle');
  const themeIcon = document.getElementById('themeIcon');

  /* ---------------- State ---------------- */
  let selectedFiles = [];      // { id, file }
  let currentImages = [];      // last rendered gallery list from server
  let isUploading = false;
  let pendingDeleteFilename = null;
  let firstLoadDone = false;

  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const MAX_SIZE = 20 * 1024 * 1024;

  /* ---------------- Init ---------------- */
  function init() {
    setupTheme();
    setupDropzone();
    setupUploadControls();
    setupViewer();
    setupConfirmModal();
    fetchImages();
    setInterval(() => { if (!isUploading) fetchImages(); }, 3000);
  }

  /* ---------------- Theme ---------------- */
  function setupTheme() {
    const saved = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    themeIcon.textContent = saved === 'dark' ? '🌙' : '☀️';

    themeToggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
      themeIcon.textContent = next === 'dark' ? '🌙' : '☀️';
    });
  }

  /* ---------------- Dropzone / file selection ---------------- */
  function setupDropzone() {
    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('drag-over');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      handleFiles(e.dataTransfer.files);
    });

    fileInput.addEventListener('change', (e) => {
      handleFiles(e.target.files);
      fileInput.value = '';
    });
  }

  function handleFiles(fileList) {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    let rejected = 0;

    files.forEach((file) => {
      if (!ALLOWED_TYPES.includes(file.type)) {
        rejected++;
        return;
      }
      if (file.size > MAX_SIZE) {
        showToast(`"${file.name}" exceeds the 20MB limit`, 'error');
        return;
      }

      const alreadySelected = selectedFiles.some(
        (item) => item.file.name === file.name && item.file.size === file.size
      );
      const alreadyUploaded = currentImages.some(
        (img) => img.originalName === file.name && img.size === file.size
      );

      if (alreadySelected || alreadyUploaded) {
        showToast(`"${file.name}" is already added`, 'error');
        return;
      }

      selectedFiles.push({ id: crypto.randomUUID(), file });
    });

    if (rejected > 0) {
      showToast(`${rejected} file(s) skipped — unsupported type`, 'error');
    }

    renderPreviews();
  }

  function renderPreviews() {
    previewGrid.innerHTML = '';

    if (selectedFiles.length === 0) {
      previewGrid.classList.add('hidden');
      uploadControls.classList.add('hidden');
      return;
    }

    previewGrid.classList.remove('hidden');
    uploadControls.classList.remove('hidden');

    selectedFiles.forEach((item) => {
      const url = URL.createObjectURL(item.file);
      const div = document.createElement('div');
      div.className = 'preview-item';
      div.innerHTML = `
        <img src="${url}" alt="${escapeHtml(item.file.name)}" />
        <button class="preview-remove" title="Remove" data-id="${item.id}">✕</button>
        <div class="preview-name">${escapeHtml(item.file.name)}</div>
      `;
      div.querySelector('.preview-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        selectedFiles = selectedFiles.filter((f) => f.id !== item.id);
        renderPreviews();
      });
      previewGrid.appendChild(div);
    });
  }

  /* ---------------- Upload controls ---------------- */
  function setupUploadControls() {
    clearBtn.addEventListener('click', () => {
      selectedFiles = [];
      renderPreviews();
    });

    uploadBtn.addEventListener('click', uploadFiles);
  }

  function uploadFiles() {
    if (selectedFiles.length === 0 || isUploading) return;

    const formData = new FormData();
    selectedFiles.forEach((item) => formData.append('images', item.file));

    isUploading = true;
    uploadBtn.disabled = true;
    uploadBtnText.textContent = 'Uploading…';
    progressWrap.classList.remove('hidden');
    progressBar.style.width = '0%';
    progressLabel.textContent = '0%';

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/upload');

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        progressBar.style.width = `${pct}%`;
        progressLabel.textContent = `${pct}%`;
      }
    });

    xhr.onload = () => {
      isUploading = false;
      uploadBtn.disabled = false;
      uploadBtnText.textContent = 'Upload';
      progressWrap.classList.add('hidden');

      let data;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = null;
      }

      if (xhr.status >= 200 && xhr.status < 300 && data && data.success) {
        showToast(data.message || 'Upload complete', 'success');
        selectedFiles = [];
        renderPreviews();
        fetchImages(true);
      } else {
        showToast((data && data.message) || 'Upload failed', 'error');
      }
    };

    xhr.onerror = () => {
      isUploading = false;
      uploadBtn.disabled = false;
      uploadBtnText.textContent = 'Upload';
      progressWrap.classList.add('hidden');
      showToast('Network error during upload', 'error');
    };

    xhr.send(formData);
  }

  /* ---------------- Gallery fetch / render ---------------- */
  async function fetchImages(forceRender = false) {
    if (!firstLoadDone) {
      loadingState.classList.remove('hidden');
      emptyState.classList.add('hidden');
      galleryEl.classList.add('hidden');
    }

    try {
      const res = await fetch('/api/images');
      const data = await res.json();

      if (!data.success) throw new Error(data.message || 'Failed to load images');

      const images = data.images || [];
      const changed = forceRender || hasChanged(currentImages, images);

      if (changed) {
        currentImages = images;
        renderGallery(images);
      }

      loadingState.classList.add('hidden');
      galleryEl.classList.remove('hidden');

      if (images.length === 0) {
        emptyState.classList.remove('hidden');
      } else {
        emptyState.classList.add('hidden');
      }

      imageCount.textContent = `${images.length} image${images.length === 1 ? '' : 's'}`;
      firstLoadDone = true;
    } catch (err) {
      loadingState.classList.add('hidden');
      if (!firstLoadDone) {
        showToast('Could not load the gallery', 'error');
      }
      firstLoadDone = true;
    }
  }

  function hasChanged(oldList, newList) {
    if (oldList.length !== newList.length) return true;
    const oldSig = oldList.map((i) => i.filename).join(',');
    const newSig = newList.map((i) => i.filename).join(',');
    return oldSig !== newSig;
  }

  function renderGallery(images) {
    galleryEl.innerHTML = '';

    images.forEach((img) => {
      const card = document.createElement('div');
      card.className = 'image-card';
      card.innerHTML = `
        <img src="${img.url}" alt="${escapeHtml(img.originalName)}" loading="lazy" />
        <button class="delete-btn" title="Delete" data-filename="${img.filename}">🗑</button>
        <div class="image-overlay">
          <div class="image-name">${escapeHtml(img.originalName)}</div>
          <div class="image-meta">${formatBytes(img.size)} · ${formatDate(img.uploadedAt)}</div>
        </div>
      `;

      card.addEventListener('click', () => openViewer(img.url));
      card.querySelector('.delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        openConfirmModal(img.filename);
      });

      galleryEl.appendChild(card);
    });
  }

  /* ---------------- Fullscreen viewer ---------------- */
  function setupViewer() {
    viewerClose.addEventListener('click', closeViewer);
    viewerModal.addEventListener('click', (e) => {
      if (e.target === viewerModal) closeViewer();
    });
    viewerImage.addEventListener('click', () => {
      viewerImage.classList.toggle('zoomed');
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeViewer();
        closeConfirmModal();
      }
    });
  }

  function openViewer(url) {
    viewerImage.src = url;
    viewerImage.classList.remove('zoomed');
    viewerModal.classList.remove('hidden');
  }

  function closeViewer() {
    viewerModal.classList.add('hidden');
    viewerImage.src = '';
  }

  /* ---------------- Confirm delete modal ---------------- */
  function setupConfirmModal() {
    confirmCancel.addEventListener('click', closeConfirmModal);
    confirmModal.addEventListener('click', (e) => {
      if (e.target === confirmModal) closeConfirmModal();
    });
    confirmDelete.addEventListener('click', () => {
      if (pendingDeleteFilename) deleteImage(pendingDeleteFilename);
      closeConfirmModal();
    });
  }

  function openConfirmModal(filename) {
    pendingDeleteFilename = filename;
    confirmModal.classList.remove('hidden');
  }

  function closeConfirmModal() {
    confirmModal.classList.add('hidden');
    pendingDeleteFilename = null;
  }

  async function deleteImage(filename) {
    try {
      const res = await fetch(`/delete/${encodeURIComponent(filename)}`, { method: 'DELETE' });
      const data = await res.json();

      if (res.ok && data.success) {
        currentImages = currentImages.filter((img) => img.filename !== filename);
        renderGallery(currentImages);
        imageCount.textContent = `${currentImages.length} image${currentImages.length === 1 ? '' : 's'}`;
        if (currentImages.length === 0) emptyState.classList.remove('hidden');
        showToast('Image deleted', 'success');
      } else {
        showToast(data.message || 'Failed to delete image', 'error');
      }
    } catch {
      showToast('Network error while deleting', 'error');
    }
  }

  /* ---------------- Toasts ---------------- */
  function showToast(message, type = 'default') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 250);
    }, 3000);
  }

  /* ---------------- Helpers ---------------- */
  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  }

  function formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  document.addEventListener('DOMContentLoaded', init);
})();
