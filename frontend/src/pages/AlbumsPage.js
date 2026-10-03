import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api, getAuthToken } from '../api';
import FileCard from '../components/FileCard';
import FilePostPage from '../components/FilePostPage';
import AddFilesToAlbumModal from '../components/AddFilesToAlbumModal';
import ConfirmDialog from '../components/ConfirmDialog';
import { subscribeGlobalUpdates } from '../realtime';

const API_BASE = process.env.REACT_APP_API_URL || '';
const normalizeFileId = (id) => (id === undefined || id === null ? '' : String(id));

function AlbumCover({ album, onToggleCoverBlur, blurBusy }) {
  const token = getAuthToken();
  const coverVersion = encodeURIComponent(album.cover?.thumbnail_updated_at || album.cover?.updated_at || album.cover?.created_at || '1');
  if (album.cover?.thumbnail) {
    return (
      <div style={{ width: '100%', height: '100%', position: 'relative' }}>
        <img
          className="file-thumbnail loaded"
          src={`${API_BASE}/api/files/thumb/${album.cover.id}?token=${token}&v=${coverVersion}`}
          alt={album.name}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: album.cover?.blurred ? 'blur(14px)' : undefined,
            transform: album.cover?.blurred ? 'scale(1.05)' : undefined,
          }}
        />
        <button
          type="button"
          className={`album-cover-blur-btn${album.cover?.blurred ? ' album-cover-blur-btn--on' : ''}`}
          title={album.cover?.blurred ? 'Remove blur' : 'Apply blur'}
          aria-label={album.cover?.blurred ? 'Remove blur' : 'Apply blur'}
          disabled={blurBusy}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggleCoverBlur?.(e);
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6.5C6.5 3 10.2 3 12 6.5C13.8 10 17.5 10 21 6.5" />
            <path d="M3 17.5C6.5 14 10.2 14 12 17.5C13.8 21 17.5 21 21 17.5" />
          </svg>
        </button>
      </div>
    );
  }
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-tertiary, #1e1e2e)', color: 'var(--text-muted)' }}>
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <path d="M21 15l-5-5L5 21"/>
      </svg>
    </div>
  );
}

function AlbumDetail({ album, onBack, onFileDelete, onFileDownload, onFileRename }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewFile, setViewFile] = useState(null);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 768px)').matches);
  const [showAddFiles, setShowAddFiles] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  const [confirmState, setConfirmState] = useState(null);
  const [coverFileId, setCoverFileId] = useState(album.cover_file_id || null);

  const selectionMode = selectedFiles.size > 0;
  const gridRef = useRef(null);
  const dragState = useRef({ timer: null, active: false, startPos: null });
  const preventNextClick = useRef(false);
  const refreshTimerRef = useRef(null);
  const pendingFileRefreshRef = useRef(new Set());

  const refreshFilesSilent = useCallback(async () => {
    const r = await api.get(`/api/albums/${album.id}/files`);
    setFiles(r.data.files);
  }, [album.id]);

  const fetchFiles = useCallback(() => {
    setLoading(true);
    refreshFilesSilent()
      .finally(() => setLoading(false));
  }, [refreshFilesSilent]);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  useEffect(() => {
    const scheduleRefresh = (delay = 140) => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        refreshFilesSilent().catch(() => {});
      }, delay);
    };

    const refreshSingleFile = async (fileId) => {
      const targetId = normalizeFileId(fileId);
      if (!targetId || pendingFileRefreshRef.current.has(targetId)) return;
      pendingFileRefreshRef.current.add(targetId);
      try {
        const { data } = await api.get(`/api/files/${encodeURIComponent(targetId)}`);
        if (!data?.file) return;
        setFiles((prev) => {
          const idx = prev.findIndex((f) => normalizeFileId(f.id) === targetId);
          if (idx === -1) return prev;
          const next = [...prev];
          next[idx] = { ...next[idx], ...data.file };
          return next;
        });
        setViewFile((prev) => (normalizeFileId(prev?.id) === targetId ? data.file : prev));
      } catch {
        scheduleRefresh(200);
      } finally {
        pendingFileRefreshRef.current.delete(targetId);
      }
    };

    const removeFileLocally = (fileId) => {
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
    };

    const unsubscribe = subscribeGlobalUpdates((evt) => {
      if (!evt?.entity) return;

      if (evt.entity === 'albums') {
        const evtAlbumId = Number(evt.albumId);
        const currentAlbumId = Number(album.id);
        if (evtAlbumId && evtAlbumId !== currentAlbumId) return;
        if (evt.action === 'cover-updated') {
          setCoverFileId(evt.fileId || null);
        }
        scheduleRefresh();
        return;
      }

      if (evt.entity !== 'files') return;

      const targetId = normalizeFileId(evt.fileId);
      if (!targetId) {
        scheduleRefresh();
        return;
      }

      if (evt.action === 'deleted') {
        removeFileLocally(targetId);
        return;
      }

      if (evt.action === 'interactions-updated' || evt.action === 'thumbnail-updated' || evt.action === 'renamed') {
        refreshSingleFile(targetId);
        return;
      }

      if (evt.action === 'blur-toggled') {
        const blurred = !!evt.blurred;
        setFiles((prev) => prev.map((f) => (normalizeFileId(f.id) === targetId ? { ...f, blurred } : f)));
        setViewFile((prev) => (normalizeFileId(prev?.id) === targetId ? { ...prev, blurred } : prev));
        return;
      }

      if (evt.action === 'processing-status') {
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

      scheduleRefresh();
    });

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      unsubscribe();
    };
  }, [album.id, refreshFilesSilent]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 768px)');
    const onChange = (e) => setIsMobile(e.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  // Escape to cancel selection
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape' && selectionMode) {
        setSelectedFiles(new Set());
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
      if (e.target.closest('.file-card-actions') || e.target.closest('.file-select-check')) return;

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

  const clearSelection = () => setSelectedFiles(new Set());

  const handleSelectAll = () => {
    if (selectedFiles.size === files.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(files.map(f => f.id)));
    }
  };

  const handleRemoveFromAlbum = (file) => {
    setConfirmState({
      title: 'Remove from album',
      message: `Remove "${file.original_name}" from this album?`,
      confirmText: 'Remove',
      danger: false,
      onConfirm: async () => {
        await api.delete(`/api/albums/${album.id}/files/${file.id}`);
        if (normalizeFileId(coverFileId) === normalizeFileId(file.id)) setCoverFileId(null);
        fetchFiles();
        if (viewFile?.id === file.id) setViewFile(null);
        setConfirmState(null);
      }
    });
  };

  const handleBulkRemove = () => {
    const count = selectedFiles.size;
    setConfirmState({
      title: 'Remove from album',
      message: `Remove ${count} files from this album?`,
      confirmText: `Remove ${count} files`,
      danger: false,
      onConfirm: async () => {
        try {
          await api.post(`/api/albums/${album.id}/files/bulk-remove`, { fileIds: [...selectedFiles] });
          if ([...selectedFiles].map(normalizeFileId).includes(normalizeFileId(coverFileId))) setCoverFileId(null);
          clearSelection();
          fetchFiles();
        } catch {
          alert('Could not remove files');
        }
        setConfirmState(null);
      }
    });
  };

  const handleBulkDelete = () => {
    const count = selectedFiles.size;
    setConfirmState({
      title: 'Bulk delete',
      message: `Delete ${count} files permanently? This cannot be undone.`,
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

  const handleDelete = (file) => {
    setConfirmState({
      title: 'Delete file',
      message: `Delete "${file.original_name}" permanently? This cannot be undone.`,
      confirmText: 'Delete',
      danger: true,
      onConfirm: async () => {
        await onFileDelete(file);
        if (normalizeFileId(coverFileId) === normalizeFileId(file.id)) setCoverFileId(null);
        fetchFiles();
        setViewFile(null);
        setConfirmState(null);
      }
    });
  };

  const handleSetCover = async (file) => {
    try {
      await api.patch(`/api/albums/${album.id}/cover`, { fileId: file.id });
      setCoverFileId(file.id);
    } catch {
      alert('Could not set album cover');
    }
  };

  const existingFileIds = files.map(f => f.id);

  if (viewFile && isMobile) {
    return (
      <FilePostPage
        file={viewFile}
        onClose={() => setViewFile(null)}
        onDelete={handleDelete}
        onDownload={onFileDownload}
        onRename={async (file) => { await onFileRename(file); fetchFiles(); }}
      />
    );
  }

  return (
    <div className="page-stack">
      <div className="topbar">
        <button className="btn btn-ghost" onClick={onBack} style={{ padding: '6px 10px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Albums
        </button>
        <h1 style={{ flex: 1, marginLeft: 8 }}>{album.name}</h1>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginRight: 12 }}>{files.length} files</span>
        <button className="btn btn-primary" onClick={() => setShowAddFiles(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add files
        </button>
      </div>

      {loading ? (
        <div className="loading-spinner"><div className="spinner" /></div>
      ) : files.length === 0 ? (
        <div className="empty-state">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <path d="M21 15l-5-5L5 21"/>
          </svg>
          <h3>Album is empty</h3>
          <p>Use "Add files" to add files</p>
        </div>
      ) : (
        <div className="file-grid" ref={gridRef}>
          {files.map(file => (
            <FileCard
              key={file.id}
              file={{
                ...file,
                uploader_color: file.uploader_color || '#60a5fa',
              }}
              selected={selectedFiles.has(file.id)}
              selectionMode={selectionMode}
              onSelect={(fileId, e) => {
                if (preventNextClick.current) {
                  preventNextClick.current = false;
                  return;
                }
                setSelectedFiles((s) => {
                  const ns = new Set(s);
                  if (ns.has(fileId)) ns.delete(fileId);
                  else ns.add(fileId);
                  return ns;
                });
              }}
              onView={setViewFile}
              onDelete={handleDelete}
              onDownload={onFileDownload}
              extraActions={[
                {
                  key: 'cover',
                  title: normalizeFileId(coverFileId) === normalizeFileId(file.id) ? 'Current cover' : 'Set as album cover',
                  onClick: () => handleSetCover(file),
                  style: {
                    color: '#60a5fa',
                    background: normalizeFileId(coverFileId) === normalizeFileId(file.id) ? 'rgba(96,165,250,0.95)' : 'rgba(15,23,42,0.85)',
                  },
                  icon: (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={normalizeFileId(coverFileId) === normalizeFileId(file.id) ? 'white' : 'currentColor'} strokeWidth="2">
                      <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
                    </svg>
                  ),
                },
                {
                  key: 'remove',
                  title: 'Remove from album',
                  onClick: () => handleRemoveFromAlbum(file),
                  style: { color: '#f59e0b', background: 'rgba(245,158,11,0.9)' },
                  icon: (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  ),
                },
              ]}
            />
          ))}
        </div>
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
            <button className="btn btn-secondary btn-sm" onClick={handleBulkRemove} style={{ color: 'var(--warning)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
              Remove from album
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

      {showAddFiles && (
        <AddFilesToAlbumModal
          albumId={album.id}
          existingFileIds={existingFileIds}
          onClose={() => setShowAddFiles(false)}
          onAdded={fetchFiles}
        />
      )}

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
          onDownload={onFileDownload}
          onRename={async (file) => { await onFileRename(file); fetchFiles(); }}
        />
      )}
    </div>
  );
}

export default function AlbumsPage({ onFileDelete, onFileDownload, onFileRename }) {
  const [albums, setAlbums] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewAlbum, setViewAlbum] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const [coverBlurBusyAlbumId, setCoverBlurBusyAlbumId] = useState(null);
  const refreshTimerRef = useRef(null);

  const fetchAlbums = useCallback(() => {
    setLoading(true);
    api.get('/api/albums')
      .then(r => setAlbums(r.data))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchAlbums(); }, [fetchAlbums]);

  useEffect(() => {
    const scheduleRefresh = (delay = 160) => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        fetchAlbums();
      }, delay);
    };

    const unsubscribe = subscribeGlobalUpdates((evt) => {
      if (!evt?.entity) return;
      if (evt.entity === 'albums') {
        scheduleRefresh(100);
        return;
      }
      if (evt.entity !== 'files') return;

      if (
        evt.action === 'thumbnail-updated' ||
        evt.action === 'deleted' ||
        evt.action === 'bulk-deleted' ||
        evt.action === 'uploaded'
      ) {
        scheduleRefresh(140);
      }
    });

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      unsubscribe();
    };
  }, [fetchAlbums]);

  const handleCreate = async () => {
    const name = window.prompt('Album name:');
    if (!name || !name.trim()) return;
    await api.post('/api/albums', { name });
    fetchAlbums();
  };

  const handleRename = async (album, e) => {
    e.stopPropagation();
    const name = window.prompt('New album name:', album.name);
    if (!name || name === album.name) return;
    await api.patch(`/api/albums/${album.id}`, { name });
    fetchAlbums();
  };

  const handleDelete = (album, e) => {
    e.stopPropagation();
    setConfirmState({
      title: 'Delete album',
      message: `Delete the album "${album.name}"? Files are kept; only the album is removed.`,
      confirmText: 'Delete album',
      danger: true,
      onConfirm: async () => {
        try {
          await api.delete(`/api/albums/${album.id}`);
          fetchAlbums();
        } catch (err) {
          alert(err.response?.data?.error || 'Could not delete album');
        }
        setConfirmState(null);
      }
    });
  };

  const handleToggleAlbumCoverBlur = async (album, e) => {
    e.stopPropagation();
    const coverId = album.cover?.id;
    if (!coverId || coverBlurBusyAlbumId === album.id) return;
    setCoverBlurBusyAlbumId(album.id);
    try {
      await api.patch(`/api/files/${coverId}/blur`);
      setAlbums((prev) => prev.map((a) => (
        a.id === album.id
          ? {
              ...a,
              cover: a.cover ? { ...a.cover, blurred: !a.cover.blurred } : a.cover,
            }
          : a
      )));
      fetchAlbums();
    } catch {
      alert('Could not update blur');
    } finally {
      setCoverBlurBusyAlbumId(null);
    }
  };

  if (viewAlbum) {
    return (
      <AlbumDetail
        album={viewAlbum}
        onBack={() => { setViewAlbum(null); fetchAlbums(); }}
        onFileDelete={onFileDelete}
        onFileDownload={onFileDownload}
        onFileRename={onFileRename}
      />
    );
  }

  return (
    <div>
      <div className="topbar">
        <h1>Albums {albums.length > 0 && <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 400 }}>({albums.length})</span>}</h1>
        <button className="btn btn-primary" onClick={handleCreate}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New album
        </button>
      </div>

      {loading ? (
        <div className="loading-spinner"><div className="spinner" /></div>
      ) : albums.length === 0 ? (
        <div className="empty-state">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <path d="M21 15l-5-5L5 21"/>
          </svg>
          <h3>No albums yet</h3>
          <p>Create one with "New album"</p>
        </div>
      ) : (
        <div className="unified-grid page-section" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          {albums.map(album => (
            <div
              key={album.id}
              onClick={() => setViewAlbum(album)}
              className="unified-card"
            >
              <div className="unified-card-cover" style={{ height: 140 }}>
                <AlbumCover
                  album={album}
                  blurBusy={coverBlurBusyAlbumId === album.id}
                  onToggleCoverBlur={(e) => handleToggleAlbumCoverBlur(album, e)}
                />
              </div>

              <div className="unified-card-body">
                <div className="unified-card-title-wrap">
                  <div className="unified-card-title">{album.name}</div>
                  <div className="unified-card-subtle">{album.file_count} files</div>
                </div>
                <div className="unified-card-actions" onClick={e => e.stopPropagation()}>
                  <button
                    className="file-action-btn"
                    title="Rename"
                    onClick={e => handleRename(album, e)}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                  <button
                    className="file-action-btn delete"
                    title="Delete album"
                    onClick={e => handleDelete(album, e)}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {confirmState && (
        <ConfirmDialog
          {...confirmState}
          onCancel={() => setConfirmState(null)}
        />
      )}
    </div>
  );
}
