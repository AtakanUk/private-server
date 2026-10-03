import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Pin, Plus, Trash2 } from 'lucide-react';
import { api, useAuth } from '../api';
import { subscribeGlobalUpdates } from '../realtime';

export default function PinboardsPage({ onOpenBoard }) {
  const { user } = useAuth();
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/api/pinboards');
      setBoards(data.boards);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const unsub = subscribeGlobalUpdates((evt) => {
      if (evt.entity === 'pinboards') load();
    });
    return () => unsub();
  }, [load]);

  const create = async () => {
    if (!name.trim()) return;
    await api.post('/api/pinboards', { name: name.trim(), description: desc.trim() });
    setName(''); setDesc(''); setCreating(false);
    load();
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this board? All cards will be deleted.')) return;
    try {
      await api.delete(`/api/pinboards/${id}`);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Could not delete board');
    }
  };

  return (
    <div className="page-stack">
      <motion.div
        className="topbar"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Pin size={22} color="var(--accent)" />
          Pinboards
        </h1>
        <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)} style={{ marginLeft: 'auto' }}>
          <Plus size={14} /> New board</button>
      </motion.div>

      {creating && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="page-section"
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 12, padding: 16,
            display: 'flex', flexDirection: 'column', gap: 10,
          }}
        >
          <input
            autoFocus
            placeholder="Board name"
            value={name}
            onChange={e => setName(e.target.value)}
            className="input"
            style={{ padding: '8px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)' }}
            onKeyDown={e => { if (e.key === 'Enter') create(); if (e.key === 'Escape') setCreating(false); }}
          />
          <textarea
            placeholder="Description (optional)"
            value={desc}
            onChange={e => setDesc(e.target.value)}
            rows={2}
            style={{ padding: '8px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setCreating(false)}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={create} disabled={!name.trim()}>Create</button>
          </div>
        </motion.div>
      )}

      {loading ? (
        <div style={{ padding: 24, color: 'var(--text-muted)' }}>Loading...</div>
      ) : boards.length === 0 ? (
        <div className="empty-state">
          No boards yet. Click the button above to create one.
        </div>
      ) : (
        <div className="unified-grid page-section" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
          {boards.map(b => (
            <motion.div
              key={b.id}
              layout
              whileHover={{ y: -3 }}
              transition={{ duration: 0.2 }}
              onClick={() => onOpenBoard(b.id)}
              className="unified-card"
              style={{ padding: 16 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: `${b.creatorColor || '#6366f1'}22`,
                  color: b.creatorColor || '#6366f1',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Pin size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="unified-card-title" style={{ color: b.creatorColor || 'var(--text-primary)' }}>
                    {b.name}
                  </div>
                  <div className="unified-card-subtle">
                    {b.creatorUsername} · {b.itemCount} {b.itemCount === 1 ? 'card' : 'cards'}
                  </div>
                </div>
                {b.userId === user?.id && (
                  <button
                    onClick={(e) => { e.stopPropagation(); remove(b.id); }}
                    title="Delete"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              {b.description && (
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  {b.description}
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
