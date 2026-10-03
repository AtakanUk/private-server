import React, { useState, useEffect, useCallback } from 'react';
import { api, getAuthToken } from '../api';

const API_BASE = process.env.REACT_APP_API_URL || '';

const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'image', label: 'Photos' },
  { key: 'video', label: 'Videos' },
  { key: 'audio', label: 'Music' },
  { key: 'document', label: 'Documents' },
];

export default function AddFilesToAlbumModal({ albumId, existingFileIds = [], onClose, onAdded }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('image');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [selected, setSelected] = useState({});
  const [adding, setAdding] = useState(false);
  const token = getAuthToken();

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const params = { category, page, limit: 30 };
      if (search) params.search = search;
      const res = await api.get('/api/files', { params });
      setFiles(res.data.files);
      setPages(res.data.pages);
    } catch {}
    setLoading(false);
  }, [category, page, search]);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const toggleSelect = (file) => {
    if (existingFileIds.includes(file.id)) return;
    setSelected(s => ({ ...s, [file.id]: !s[file.id] }));
  };

  const selectedCount = Object.values(selected).filter(Boolean).length;

  const handleAdd = async () => {
    const toAdd = Object.entries(selected).filter(([, v]) => v).map(([id]) => id);
    if (!toAdd.length) return;
    setAdding(true);
    try {
      await Promise.all(toAdd.map(async fileId => {
        try {
          await api.post(`/api/albums/${albumId}/files`, { fileId });
        } catch (err) {
          const status = err?.response?.status;
          if (status === 404 || status === 405 || status === 501) {
            await api.post(`/api/files/${fileId}/albums/${albumId}`);
          } else {
            throw err;
          }
        }
      }));
      onAdded();
      onClose();
    } catch (err) {
      const message = err?.response?.data?.error || err?.message || 'Could not add files to the album';
      alert(message);
    }
    setAdding(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 680, width: '95vw' }}
      >
        <div className="modal-header">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <path d="M21 15l-5-5L5 21"/>
          </svg>
          <span className="modal-title">Add files to album</span>
          <button className="btn btn-ghost" onClick={onClose} style={{ padding: 6, marginLeft: 'auto' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {CATEGORIES.map(c => (
              <button
                key={c.key}
                onClick={() => { setCategory(c.key); setPage(1); }}
                className={`btn btn-sm ${category === c.key ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '4px 10px', fontSize: '0.8rem' }}
              >
                {c.label}
              </button>
            ))}
          </div>
          <input
            className="form-input"
            placeholder="Search..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            style={{ flex: 1, minWidth: 120, padding: '4px 10px', fontSize: '0.85rem' }}
          />
        </div>

        <div className="modal-body" style={{ padding: 12, minHeight: 0, maxHeight: '55vh', overflowY: 'auto', flexDirection: 'column' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
              <div className="spinner" />
            </div>
          ) : files.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No files found</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
              {files.map(file => {
                const isExisting = existingFileIds.includes(file.id);
                const isSelected = selected[file.id];
                const thumbnailVersion = encodeURIComponent(file.thumbnail_updated_at || file.updated_at || file.created_at || '1');
                return (
                  <div
                    key={file.id}
                    onClick={() => toggleSelect(file)}
                    style={{
                      position: 'relative',
                      borderRadius: 8,
                      overflow: 'hidden',
                      border: isExisting
                        ? '2px solid var(--border)'
                        : isSelected
                        ? '2px solid #6366f1'
                        : '2px solid transparent',
                      background: 'var(--bg-secondary)',
                      cursor: isExisting ? 'default' : 'pointer',
                      opacity: isExisting ? 0.5 : 1,
                      transition: 'border-color 0.15s',
                    }}
                    title={isExisting ? 'Already in album' : file.original_name}
                  >
                    <div style={{ height: 90, background: 'var(--bg-tertiary, #1e1e2e)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {file.thumbnail ? (
                        <img
                          src={`${API_BASE}/api/files/thumb/${file.id}?token=${token}&v=${thumbnailVersion}`}
                          alt={file.original_name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.4 }}>
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                          <path d="M14 2v6h6"/>
                        </svg>
                      )}
                    </div>
                    <div style={{ padding: '4px 6px', fontSize: '0.7rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                      {file.original_name}
                    </div>

                    {isSelected && (
                      <div style={{
                        position: 'absolute', top: 6, right: 6,
                        background: '#6366f1', borderRadius: '50%',
                        width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      </div>
                    )}
                    {isExisting && (
                      <div style={{
                        position: 'absolute', top: 6, right: 6,
                        background: '#22c55e', borderRadius: '50%',
                        width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {pages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, padding: '8px 16px', borderTop: '1px solid var(--border)' }}>
            <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>←</button>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '28px' }}>{page} / {pages}</span>
            <button className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>→</button>
          </div>
        )}

        <div className="modal-footer">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleAdd}
            disabled={selectedCount === 0 || adding}
          >
            {adding ? '...' : `${selectedCount > 0 ? selectedCount + ' file(s) ' : ''}Add`}
          </button>
        </div>
      </div>
    </div>
  );
}
