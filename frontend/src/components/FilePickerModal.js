import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search } from 'lucide-react';
import { api, getAuthToken } from '../api';

const API_BASE = process.env.REACT_APP_API_URL || '';

export default function FilePickerModal({ onClose, onPick, filter = 'all' }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const token = getAuthToken();

  useEffect(() => {
    const q = new URLSearchParams({ limit: '100' });
    if (filter && filter !== 'all') q.set('category', filter);
    if (search) q.set('search', search);
    setLoading(true);
    api.get(`/api/files?${q}`)
      .then(r => setFiles(r.data.files || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [search, filter]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={e => e.stopPropagation()}
          style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            borderRadius: 12, width: '100%', maxWidth: 800, maxHeight: '80vh',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}
        >
          <div style={{
            padding: '12px 16px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontWeight: 600 }}>Select file</span>
            <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
              <X size={18} />
            </button>
          </div>

          <div style={{ padding: 12, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Search size={16} color="var(--text-muted)" />
            <input
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                flex: 1, padding: '6px 10px', background: 'var(--bg-primary)',
                border: '1px solid var(--border)', borderRadius: 6,
                color: 'var(--text-primary)', outline: 'none',
              }}
            />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
            {loading ? (
              <div style={{ padding: 20, color: 'var(--text-muted)' }}>Loading...</div>
            ) : files.length === 0 ? (
              <div style={{ padding: 20, color: 'var(--text-muted)' }}>No files</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
                {files.map(f => (
                  <button
                    key={f.id}
                    onClick={() => onPick(f.id)}
                    style={{
                      background: 'var(--bg-primary)', border: '1px solid var(--border)',
                      borderRadius: 8, padding: 0, cursor: 'pointer', overflow: 'hidden',
                      display: 'flex', flexDirection: 'column', aspectRatio: '1',
                    }}
                  >
                    {f.thumbnail ? (
                      <img
                        src={`${API_BASE}/api/files/thumb/${f.id}?token=${token}&v=${encodeURIComponent(f.thumbnail_updated_at || f.updated_at || f.created_at || '1')}`}
                        alt={f.original_name}
                        style={{ flex: 1, width: '100%', objectFit: 'cover', minHeight: 0 }}
                      />
                    ) : (
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        {f.category}
                      </div>
                    )}
                    <div style={{
                      padding: 4, fontSize: '0.7rem',
                      background: 'rgba(0,0,0,0.4)', color: '#fff',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {f.original_name}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
