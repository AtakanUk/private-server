import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api, getAuthToken } from '../api';
import FileCard from '../components/FileCard';
import FilePostPage from '../components/FilePostPage';
import UploadZone from '../components/UploadZone';
import ConfirmDialog from '../components/ConfirmDialog';
import AlbumPickerModal from '../components/AlbumPickerModal';
import { SkeletonGrid } from '../components/Skeleton';
import { subscribeGlobalUpdates } from '../realtime';

const CATEGORIES = [
  { key: 'all', label: 'All', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> },
  { key: 'image', label: 'Photos', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg> },
  { key: 'video', label: 'Videos', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="15" height="16" rx="2"/><path d="M17 8l5-4v16l-5-4V8z"/></svg> },
  { key: 'audio', label: 'Music', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg> },
  { key: 'document', label: 'Documents', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg> },
];

const SORT_OPTIONS = [
  { key: 'upload_date', label: 'Upload date' },
  { key: 'file_date',   label: 'File date' },
  { key: 'size',        label: 'Size' },
  { key: 'name',        label: 'Name' },
  { key: 'type',        label: 'Type' },
];

const AscIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
  </svg>
);
const DescIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>
  </svg>
);

const normalizeFileId = (id) => (id === undefined || id === null ? '' : String(id));

export default function FilesPage({ defaultCategory = 'all', focusFileId = null, onFocusConsumed }) {
  const [files, setFiles] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState(defaultCategory);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [viewFile, setViewFile] = useState(null);
  const [showUpload, setShowUpload] = useState(false);
  const [sort, setSort] = useState('upload_date');
  const [order, setOrder] = useState('desc');

  // Selection state
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const [showBulkAlbumPicker, setShowBulkAlbumPicker] = useState(false);

  const selectionMode = selectedFiles.size > 0;
  const gridRef = useRef(null);
  const dragState = useRef({ timer: null, active: false, startPos: null });
  const preventNextClick = useRef(false);
  const refreshTimerRef = useRef(null);
  const pendingFileRefreshRef = useRef(new Set());

  const refreshCurrentPage = useCallback(async () => {
    const params = { category, page, limit: 48, sort, order };
    if (search) params.search = search;
    const res = await api.get('/api/files', { params });
    setFiles(res.data.files);
    setTotal(res.data.total);
    setPages(res.data.pages);
  }, [category, page, search, sort, order]);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      await refreshCurrentPage();
    } catch {
      // handle silently
    } finally {
      setLoading(false);
    }
  }, [refreshCurrentPage]);

  const scheduleRefresh = useCallback((delay = 140) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      refreshCurrentPage().catch(() => {});
    }, delay);
  }, [refreshCurrentPage]);

  const mergeFile = useCallback((nextFile) => {
    if (!nextFile) return;
    const targetId = normalizeFileId(nextFile.id);
    if (!targetId) return;

    setFiles((prev) => {
      const idx = prev.findIndex((f) => normalizeFileId(f.id) === targetId);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], ...nextFile };
      return next;
    });
  }, []);

  const removeFileLocally = useCallback((fileId) => {
    const targetId = normalizeFileId(fileId);
    if (!targetId) return;

    setFiles((prev) => prev.filter((f) => normalizeFileId(f.id) !== targetId));
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      next.delete(targetId);
      return next;
    });
    setViewFile((prev) => (normalizeFileId(prev?.id) === targetId ? null : prev));
    scheduleRefresh(220);
  }, [scheduleRefresh]);

  const refreshSingleFile = useCallback(async (fileId) => {
    const targetId = normalizeFileId(fileId);
    if (!targetId) return;
    if (pendingFileRefreshRef.current.has(targetId)) return;

    pendingFileRefreshRef.current.add(targetId);
    try {
      const { data } = await api.get(`/api/files/${encodeURIComponent(targetId)}`);
      if (!data?.file) return;
      mergeFile(data.file);
      setViewFile((prev) => (normalizeFileId(prev?.id) === targetId ? data.file : prev));
    } catch {
      scheduleRefresh(220);
    } finally {
      pendingFileRefreshRef.current.delete(targetId);
    }
  }, [mergeFile, scheduleRefresh]);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  useEffect(() => {
    if (!focusFileId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(`/api/files/${focusFileId}`);
        if (cancelled) return;
        if (data?.file) setViewFile(data.file);
      } catch {}
      if (onFocusConsumed) onFocusConsumed();
    })();
    return () => { cancelled = true; };
  }, [focusFileId, onFocusConsumed]);

  useEffect(() => {
    const unsubscribe = subscribeGlobalUpdates((evt) => {
      if (!evt?.entity) return;

      if (evt.entity === 'files') {
        const targetId = normalizeFileId(evt.fileId);

        if (evt.action === 'interactions-updated' || evt.action === 'thumbnail-updated' || evt.action === 'renamed') {
          refreshSingleFile(targetId);
          return;
        }

        if (evt.action === 'blur-toggled' && targetId) {
          const blurred = !!evt.blurred;
          setFiles((prev) => prev.map((f) => (normalizeFileId(f.id) === targetId ? { ...f, blurred } : f)));
          setViewFile((prev) => (normalizeFileId(prev?.id) === targetId ? { ...prev, blurred } : prev));
          return;
        }

        if (evt.action === 'processing-status' && targetId) {
          setFiles((prev) => prev.map((f) => (
            normalizeFileId(f.id) === targetId
              ? {
                  ...f,
                  proxy_status: evt.proxyStatus ?? f.proxy_status,
                  proxy_variants: evt.proxyVariants ?? f.proxy_variants,
                }
              : f
          )));
          setViewFile((prev) => (
            normalizeFileId(prev?.id) === targetId
              ? {
                  ...prev,
                  proxy_status: evt.proxyStatus ?? prev.proxy_status,
                  proxy_variants: evt.proxyVariants ?? prev.proxy_variants,
                }
              : prev
          ));
          return;
        }

        if (evt.action === 'deleted') {
          removeFileLocally(targetId);
          return;
        }

        scheduleRefresh();
        return;
      }

      if (evt.entity === 'albums' || evt.entity === 'folders') {
        scheduleRefresh();
      }
    });

    return () => unsubscribe();
  }, [refreshSingleFile, removeFileLocally, scheduleRefresh]);

  useEffect(() => () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
  }, []);

  // Clear selection on page/filter change
  useEffect(() => {
    setSelectedFiles(new Set());
    setLastSelectedIndex(null);
  }, [category, page, search, sort, order]);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Escape to cancel selection
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape' && selectionMode) {
        setSelectedFiles(new Set());
        setLastSelectedIndex(null);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selectionMode]);

  // Touch long press + drag select
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const onTouchStart = (e) => {
      preventNextClick.current = false;
      const card = e.target.closest('[data-file-id]');
      if (!card) return;
      if (e.target.closest('.file-card-actions') || e.target.closest('.file-blur-btn') || e.target.closest('.file-select-check')) return;

      const fileId = card.dataset.fileId;
      const touch = e.touches[0];
      dragState.current = {
        timer: setTimeout(() => {
          dragState.current.active = true;
          preventNextClick.current = true;
          if (navigator.vibrate) navigator.vibrate(30);
          setSelectedFiles(s => { const ns = new Set(s); ns.add(fileId); return ns; });
        }, 500),
        active: false,
        startPos: { x: touch.clientX, y: touch.clientY },
      };
    };

    const onTouchMove = (e) => {
      if (dragState.current.active) {
        e.preventDefault();
        const touch = e.touches[0];
        const el = document.elementFromPoint(touch.clientX, touch.clientY);
        const card = el?.closest('[data-file-id]');
        if (card) {
          const fileId = card.dataset.fileId;
          setSelectedFiles(s => {
            if (s.has(fileId)) return s;
            const ns = new Set(s);
            ns.add(fileId);
            return ns;
          });
        }
        return;
      }
      if (dragState.current.timer && dragState.current.startPos) {
        const touch = e.touches[0];
        const dx = touch.clientX - dragState.current.startPos.x;
        const dy = touch.clientY - dragState.current.startPos.y;
        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
          clearTimeout(dragState.current.timer);
          dragState.current.timer = null;
        }
      }
    };

    const onTouchEnd = () => {
      if (dragState.current.timer) {
        clearTimeout(dragState.current.timer);
        dragState.current.timer = null;
      }
      dragState.current.active = false;
    };

    grid.addEventListener('touchstart', onTouchStart, { passive: true });
    grid.addEventListener('touchmove', onTouchMove, { passive: false });
    grid.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      grid.removeEventListener('touchstart', onTouchStart);
      grid.removeEventListener('touchmove', onTouchMove);
      grid.removeEventListener('touchend', onTouchEnd);
      if (dragState.current.timer) clearTimeout(dragState.current.timer);
    };
  }, []);

  // Selection handler
  const handleFileSelect = (fileId, e) => {
    if (preventNextClick.current) {
      preventNextClick.current = false;
      return;
    }
    const index = files.findIndex(f => f.id === fileId);

    if (e?.shiftKey && lastSelectedIndex !== null) {
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      setSelectedFiles(s => {
        const ns = new Set(s);
        for (let i = start; i <= end; i++) ns.add(files[i].id);
        return ns;
      });
    } else {
      setSelectedFiles(s => {
        const ns = new Set(s);
        if (ns.has(fileId)) ns.delete(fileId);
        else ns.add(fileId);
        return ns;
      });
    }
    setLastSelectedIndex(index);
  };

  const handleFileView = (file) => {
    if (preventNextClick.current) {
      preventNextClick.current = false;
      return;
    }
    setViewFile(file);
  };

  const handleSortClick = (key) => {
    if (sort === key) {
      setOrder(o => o === 'desc' ? 'asc' : 'desc');
    } else {
      setSort(key);
      setOrder('desc');
    }
    setPage(1);
  };

  const handleSelectAll = () => {
    if (selectedFiles.size === files.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(files.map(f => f.id)));
    }
  };

  const clearSelection = () => {
    setSelectedFiles(new Set());
    setLastSelectedIndex(null);
  };

  // Single delete with confirmation
  const handleDelete = (file) => {
    setConfirmState({
      title: 'Delete file',
      message: `Delete "${file.original_name}"? This cannot be undone.`,
      confirmText: 'Delete',
      danger: true,
      onConfirm: async () => {
        try {
          await api.delete(`/api/files/${file.id}`);
          setViewFile(null);
          fetchFiles();
        } catch {
          alert('Could not delete file');
        }
        setConfirmState(null);
      }
    });
  };

  // Bulk delete
  const handleBulkDelete = () => {
    const count = selectedFiles.size;
    setConfirmState({
      title: 'Bulk delete',
      message: `Delete ${count} files? This cannot be undone.`,
      confirmText: `Delete ${count} files`,
      danger: true,
      onConfirm: async () => {
        try {
          await api.post('/api/files/bulk-delete', { fileIds: [...selectedFiles] });
          clearSelection();
          fetchFiles();
        } catch {
          alert('Could not delete files');
        }
        setConfirmState(null);
      }
    });
  };

  const handleDownload = file => {
    const API_BASE = process.env.REACT_APP_API_URL || '';
    const token = getAuthToken();
    const a = document.createElement('a');
    a.href = `${API_BASE}/api/files/download/${file.id}?token=${token}`;
    a.download = file.original_name;
    a.click();
  };

  const handleRename = async file => {
    const dotIdx = file.original_name.lastIndexOf('.');
    const nameOnly = dotIdx > 0 ? file.original_name.slice(0, dotIdx) : file.original_name;
    const ext = dotIdx > 0 ? file.original_name.slice(dotIdx) : '';
    const input = window.prompt('New file name:', nameOnly);
    if (!input || input === nameOnly) return;
    const newName = input + ext;
    try {
      await api.patch(`/api/files/${file.id}/rename`, { name: newName });
      fetchFiles();
      if (viewFile?.id === file.id) setViewFile({ ...viewFile, original_name: newName });
    } catch {
      alert('Rename failed');
    }
  };

  return (
    <div className="page-stack">
      {/* Top Bar */}
      <div className="topbar">
        <h1>Files {total > 0 && <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 400 }}>({total})</span>}</h1>
        <div className="search-box">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="search"
            placeholder="Search files..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
          />
        </div>
        <button className="btn btn-primary" onClick={() => setShowUpload(s => !s)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Upload
        </button>
      </div>

      {/* Upload Zone */}
      {showUpload && (
        <div className="page-section">
          <UploadZone onUploadComplete={() => { fetchFiles(); setShowUpload(false); }} />
        </div>
      )}

      {/* Filter Tabs */}
      <div className="filter-tabs page-section">
        {CATEGORIES.map(c => (
          <button
            key={c.key}
            className={`filter-tab ${category === c.key ? 'active' : ''}`}
            onClick={() => { setCategory(c.key); setPage(1); }}
          >
            {c.icon}
            {c.label}
          </button>
        ))}
      </div>

      {/* Sort Bar */}
      <div className="page-section" style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginRight: 2 }}>Sort:</span>
        {SORT_OPTIONS.map(opt => {
          const isActive = sort === opt.key;
          return (
            <button
              key={opt.key}
              onClick={() => handleSortClick(opt.key)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '5px 10px',
                borderRadius: 20,
                border: '1px solid',
                borderColor: isActive ? 'var(--accent)' : 'var(--border)',
                background: isActive ? 'var(--accent-light)' : 'transparent',
                color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                fontSize: '0.78rem',
                fontWeight: isActive ? 600 : 400,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {opt.label}
              {isActive && (order === 'desc' ? <DescIcon /> : <AscIcon />)}
            </button>
          );
        })}
      </div>

      {/* File Grid */}
      {loading ? (
        <SkeletonGrid count={48} />
      ) : files.length === 0 ? (
        <div className="empty-state">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
          </svg>
          <h3>No files yet</h3>
          <p>Click Upload to add files</p>
        </div>
      ) : (
        <>
          <div className="file-grid" ref={gridRef}>
            {files.map(file => (
              <FileCard
                key={file.id}
                file={file}
                selected={selectedFiles.has(file.id)}
                selectionMode={selectionMode}
                onSelect={handleFileSelect}
                onView={handleFileView}
                onDelete={handleDelete}
                onDownload={handleDownload}
              />
            ))}
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 32, marginBottom: selectionMode ? 80 : 0, flexWrap: 'wrap' }}>
              <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                ← Previous
              </button>
              {Array.from({ length: Math.min(pages, 7) }, (_, i) => {
                const p = i + Math.max(1, page - 3);
                if (p > pages) return null;
                return (
                  <button key={p} className={`btn btn-sm ${page === p ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPage(p)}>
                    {p}
                  </button>
                );
              })}
              <button className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>
                Next →
              </button>
            </div>
          )}
        </>
      )}

      {/* Bulk Action Bar */}
      {selectionMode && (
        <div className="bulk-action-bar">
          <button className="btn btn-ghost" onClick={clearSelection} style={{ padding: 6 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
          <span className="bulk-action-count">
            {selectedFiles.size} selected</span>
          <div className="bulk-action-buttons">
            <button className="btn btn-secondary btn-sm" onClick={handleSelectAll}>
              {selectedFiles.size === files.length ? 'Clear selection' : 'Select all'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowBulkAlbumPicker(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <path d="M21 15l-5-5L5 21"/>
              </svg>
              Add to album
            </button>
            <button className="btn btn-danger btn-sm" onClick={handleBulkDelete}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
              </svg>
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      {confirmState && (
        <ConfirmDialog
          {...confirmState}
          onCancel={() => setConfirmState(null)}
        />
      )}

      {viewFile && (
        <FilePostPage
          file={viewFile}
          onClose={() => setViewFile(null)}
          onDelete={handleDelete}
          onDownload={handleDownload}
          onRename={handleRename}
        />
      )}

      {/* Bulk Album Picker */}
      {showBulkAlbumPicker && (
        <AlbumPickerModal
          fileIds={[...selectedFiles]}
          onClose={() => { setShowBulkAlbumPicker(false); clearSelection(); }}
        />
      )}
    </div>
  );
}
