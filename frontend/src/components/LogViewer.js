import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../api';

function fmtTime(ts) {
  if (!ts) return '-';
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return ts;
  }
}

function statusColor(status) {
  if (!status) return '#6b7280';
  if (status >= 500) return '#dc2626';
  if (status >= 400) return '#f59e0b';
  if (status >= 300) return '#3b82f6';
  if (status >= 200) return '#22c55e';
  return '#6b7280';
}

function categoryBadge(cat) {
  const map = {
    http: { label: 'HTTP', bg: 'rgba(99,102,241,0.18)', fg: '#a5b4fc' },
    media: { label: 'MEDIA', bg: 'rgba(245,158,11,0.18)', fg: '#fcd34d' },
    'spa-event': { label: 'EVENT', bg: 'rgba(236,72,153,0.18)', fg: '#f9a8d4' },
  };
  const m = map[cat] || { label: cat || '?', bg: 'rgba(107,114,128,0.18)', fg: '#9ca3af' };
  return (
    <span style={{
      background: m.bg, color: m.fg,
      padding: '2px 6px', borderRadius: 4,
      fontSize: '0.65rem', fontWeight: 700, letterSpacing: 0.4,
    }}>{m.label}</span>
  );
}

export default function LogViewer({ users = [] }) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [availableDates, setAvailableDates] = useState([]);
  const [user, setUser] = useState('');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('default');
  const [status, setStatus] = useState('all');
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState('');
  const limit = 200;

  useEffect(() => {
    api.get('/api/admin/logs/dates')
      .then(r => setAvailableDates(r.data.dates || []))
      .catch(() => {});
  }, []);

  const fetchLogs = useCallback(async (newOffset = 0, append = false) => {
    setLoading(true);
    setError('');
    try {
      const params = { date, limit, offset: newOffset };
      if (user) params.user = user;
      if (q) params.q = q;
      if (category && category !== 'all') params.category = category;
      if (status && status !== 'all') params.status = status;
      const res = await api.get('/api/admin/logs', { params });
      setTotal(res.data.total || 0);
      setItems(prev => append ? [...prev, ...(res.data.items || [])] : (res.data.items || []));
      setOffset(newOffset);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load logs');
    } finally {
      setLoading(false);
    }
  }, [date, user, q, category, status]);

  useEffect(() => {
    fetchLogs(0, false);
  }, [fetchLogs]);

  const userOptions = useMemo(() => {
    return [
      { value: '', label: 'All users' },
      ...users.map(u => ({ value: u.username, label: u.username })),
      { value: 'guest', label: '(guest / no token)' },
    ];
  }, [users]);

  return (
    <div className="unified-card page-section" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Server logs {total > 0 ? `(${items.length}/${total})` : ''}</h3>
          <button className="btn btn-ghost btn-sm" onClick={() => fetchLogs(0, false)} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
          <label style={{ display: 'grid', gap: 4, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Date
            <input
              type="date"
              className="form-input"
              value={date}
              max={new Date().toISOString().slice(0, 10)}
              list="log-dates"
              onChange={(e) => setDate(e.target.value)}
            />
            <datalist id="log-dates">
              {availableDates.map(d => <option key={d} value={d} />)}
            </datalist>
          </label>

          <label style={{ display: 'grid', gap: 4, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            User
            <select className="form-input" value={user} onChange={(e) => setUser(e.target.value)}>
              {userOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>

          <label style={{ display: 'grid', gap: 4, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Category
            <select className="form-input" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="default">HTTP + events (no media)</option>
              <option value="all">All</option>
              <option value="http">HTTP only</option>
              <option value="media">Media only (thumb/avatar)</option>
              <option value="spa-event">SPA events only</option>
            </select>
          </label>

          <label style={{ display: 'grid', gap: 4, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Status
            <select className="form-input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All</option>
              <option value="2xx">Successful only (2xx)</option>
              <option value="errors">Errors only (4xx+5xx)</option>
              <option value="4xx">4xx only</option>
              <option value="5xx">5xx only</option>
            </select>
          </label>

          <label style={{ display: 'grid', gap: 4, fontSize: '0.75rem', color: 'var(--text-muted)', gridColumn: 'span 2' }}>
            Search (path / event / IP)
            <input className="form-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. /api/files or file_opened" />
          </label>
        </div>
      </div>

      {error && (
        <div style={{ padding: '10px 16px', color: '#f87171', fontSize: '0.85rem', background: 'rgba(239,68,68,0.08)' }}>
          {error}
        </div>
      )}

      <div style={{ overflowX: 'auto', maxHeight: '60vh', overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-secondary)', zIndex: 1 }}>
            <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
              <th style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>Time</th>
              <th style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>User</th>
              <th style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>IP</th>
              <th style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>Category</th>
              <th style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>Action</th>
              <th style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>Status</th>
              <th style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>ms</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !loading && (
              <tr><td colSpan="7" style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>
                No logs match this filter.
              </td></tr>
            )}
            {items.map((it, idx) => (
              <LogRow key={idx} item={it} />
            ))}
          </tbody>
        </table>
      </div>

      {items.length < total && (
        <div style={{ padding: '10px 16px', textAlign: 'center', borderTop: '1px solid var(--border)' }}>
          <button
            className="btn btn-secondary btn-sm"
            disabled={loading}
            onClick={() => fetchLogs(offset + limit, true)}
          >
            {loading ? 'Loading...' : `Load more (${total - items.length} left)`}
          </button>
        </div>
      )}
    </div>
  );
}

const ENTITY_BADGES = {
  file: { icon: '📁', label: 'file' },
  pinboard: { icon: '📌', label: 'board' },
  pinboard_item: { icon: '🖼', label: 'card' },
  album: { icon: '📂', label: 'album' },
  folder: { icon: '🗂', label: 'folder' },
  user: { icon: '👤', label: 'user' },
};

function LogRow({ item }) {
  const [open, setOpen] = useState(false);
  const isEvent = item.category === 'spa-event';
  const action = isEvent
    ? `${item.event}${item.details ? ` ${typeof item.details === 'string' ? item.details : JSON.stringify(item.details)}` : ''}`
    : `${item.method || ''} ${item.url || ''}`;
  const badge = item.entityType ? ENTITY_BADGES[item.entityType] : null;

  return (
    <>
      <tr
        onClick={() => setOpen(o => !o)}
        style={{ cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
      >
        <td style={{ padding: '6px 10px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
          {fmtTime(item.ts)}
        </td>
        <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
          {item.username || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>guest</span>}
          {item.userId ? <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}> #{item.userId}</span> : null}
        </td>
        <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {item.ip || '-'}
        </td>
        <td style={{ padding: '6px 10px' }}>
          {categoryBadge(item.category)}
        </td>
        <td style={{ padding: '6px 10px', fontFamily: 'monospace', wordBreak: 'break-all', maxWidth: 500 }}>
          {action}
          {item.entityLabel && (
            <span style={{ marginLeft: 8, fontFamily: 'inherit', fontStyle: 'italic', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
              {badge ? <span title={badge.label} style={{ marginRight: 4 }}>{badge.icon}</span> : null}
              → {item.entityLabel}
            </span>
          )}
        </td>
        <td style={{ padding: '6px 10px', textAlign: 'right' }}>
          {item.status ? (
            <span style={{ color: statusColor(item.status), fontWeight: 700 }}>{item.status}</span>
          ) : '-'}
        </td>
        <td style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
          {item.duration ?? '-'}
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan="7" style={{ padding: '8px 16px', background: 'rgba(0,0,0,0.15)' }}>
            <pre style={{
              margin: 0, fontSize: '0.7rem', color: 'var(--text-muted)',
              whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              fontFamily: 'monospace',
            }}>{JSON.stringify(item, null, 2)}</pre>
          </td>
        </tr>
      )}
    </>
  );
}
