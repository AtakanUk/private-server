import React, { useState, useEffect } from 'react';
import { api } from '../api';

export default function AlbumPickerModal({ file, fileIds: propFileIds, onClose }) {
  const [albums, setAlbums] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(null);
  const [added, setAdded] = useState({});
  const [existingAlbumIds, setExistingAlbumIds] = useState(new Set());
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const fileIds = propFileIds || (file ? [file.id] : []);
  const isSingle = !propFileIds && !!file;
  const isMulti = !!propFileIds;

  useEffect(() => {
    api.get('/api/albums')
      .then(r => setAlbums(r.data))
      .finally(() => setLoading(false));
  }, []);

  // For single file, fetch which albums it's already in
  useEffect(() => {
    if (isSingle && file) {
      api.get(`/api/files/${file.id}/albums`)
        .then(r => setExistingAlbumIds(new Set(r.data.albumIds)))
        .catch(() => {});
    }
  }, [isSingle, file]);

  const handleAdd = async (albumId) => {
    if (isSingle && existingAlbumIds.has(albumId)) return;
    setAdding(albumId);
    try {
      if (fileIds.length === 1) {
        await api.post(`/api/albums/${albumId}/files`, { fileId: fileIds[0] });
      } else {
        await api.post(`/api/albums/${albumId}/files/bulk`, { fileIds });
      }
      setAdded(a => ({ ...a, [albumId]: true }));
      if (isSingle) {
        setExistingAlbumIds(s => { const ns = new Set(s); ns.add(albumId); return ns; });
      }
    } catch {}
    setAdding(null);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await api.post('/api/albums', { name: newName.trim() });
      const newAlbum = { id: res.data.id, name: res.data.name, file_count: 0, cover: null };
      if (fileIds.length === 1) {
        await api.post(`/api/albums/${res.data.id}/files`, { fileId: fileIds[0] });
      } else {
        await api.post(`/api/albums/${res.data.id}/files/bulk`, { fileIds });
      }
      setAdded(a => ({ ...a, [res.data.id]: true }));
      if (isSingle) {
        setExistingAlbumIds(s => { const ns = new Set(s); ns.add(res.data.id); return ns; });
      }
      setAlbums(al => [newAlbum, ...al]);
      setNewName('');
    } catch {}
    setCreating(false);
  };

  const titleText = isMulti
    ? `Add ${fileIds.length} Files to Album`
    : 'Add to Album';

  const descText = isMulti
    ? `Choose an album for ${fileIds.length} files.`
    : null;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1500 }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560, width: '96vw' }}>
        <div className="modal-header">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <path d="M21 15l-5-5L5 21"/>
          </svg>
          <span className="modal-title">{titleText}</span>
          <button className="btn btn-ghost" onClick={onClose} style={{ padding: 6, marginLeft: 'auto' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="modal-body" style={{ padding: '14px 16px 10px', maxHeight: 520, overflowY: 'auto', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-start', background: 'var(--bg-primary)', minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', minWidth: 0 }}>
              {isSingle ? (
                <>
                  Choose an album to add{' '}
                  <strong style={{ color: 'var(--text-primary)' }}>{file.original_name}</strong>
                  {' '}to.
                </>
              ) : descText}
            </p>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{albums.length} albums</span>
          </div>

          <form onSubmit={handleCreate} style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <input
              className="form-input"
              placeholder="New album name..."
              value={newName}
              onChange={e => setNewName(e.target.value)}
              style={{ flex: 1, padding: '7px 10px', fontSize: '0.85rem' }}
            />
            <button className="btn btn-primary btn-sm" type="submit" disabled={creating || !newName.trim()}>
              {creating ? (
                <div className="spinner" style={{ width: 14, height: 14 }} />
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  Create
                </>
              )}
            </button>
          </form>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 28 }}><div className="spinner" /></div>
          ) : albums.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', padding: '18px 12px', background: 'var(--bg-secondary)', borderRadius: 10, border: '1px dashed var(--border)' }}>
              No albums yet. Create one above.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {albums.map(album => {
                const isExisting = isSingle && existingAlbumIds.has(album.id);
                const isAdded = added[album.id];

                return (
                  <div
                    key={album.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '11px 12px',
                      background: isAdded ? 'rgba(34,197,94,0.08)' : isExisting ? 'rgba(100,116,139,0.08)' : 'var(--bg-secondary)',
                      borderRadius: 10,
                      border: `1px solid ${isAdded ? 'rgba(34,197,94,0.3)' : isExisting ? 'rgba(100,116,139,0.2)' : 'var(--border)'}`,
                      transition: 'all 0.15s',
                      opacity: isExisting ? 0.6 : 1,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 8,
                        background: 'var(--bg-tertiary, #1e1e2e)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5">
                          <rect x="3" y="3" width="18" height="18" rx="2"/>
                          <circle cx="8.5" cy="8.5" r="1.5"/>
                          <path d="M21 15l-5-5L5 21"/>
                        </svg>
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 500, fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{album.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{album.file_count || 0} files</div>
                      </div>
                    </div>

                    {isExisting ? (
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        Already added
                      </span>
                    ) : isAdded ? (
                      <span style={{ fontSize: '0.8rem', color: '#22c55e', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        Added
                      </span>
                    ) : (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleAdd(album.id)}
                        disabled={adding === album.id}
                        style={{ flexShrink: 0 }}
                      >
                        {adding === album.id ? (
                          <div className="spinner" style={{ width: 12, height: 12 }} />
                        ) : (
                          <>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                            </svg>
                            Add
                          </>
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-primary btn-sm" onClick={onClose}>OK</button>
        </div>
      </div>
    </div>
  );
}
