import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api';
import { subscribeGlobalUpdates } from '../realtime';

const DEFAULT_TARGETS = [];

function getTimeLeft(targetDateString) {
  const target = new Date(targetDateString);
  if (Number.isNaN(target.getTime())) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, done: false, invalid: true };
  }
  const diff = target - new Date();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, done: true, invalid: false };
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
    done: false,
    invalid: false,
  };
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function uid() {
  return `cd-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

// Emoji-safe slice: cut by grapheme so ZWJ / variation-selector emojis stay intact
function emojiSlice(str, max = 1) {
  const input = String(str || '');
  if (!input) return '';
  try {
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
      return [...seg.segment(input)].slice(0, max).map((x) => x.segment).join('');
    }
  } catch {}
  return Array.from(input).slice(0, max).join('');
}

export default function CountdownWidget({ alwaysShow = false }) {
  const [minimized, setMinimized] = useState(() => localStorage.getItem('cd_min') !== 'false');
  const [editing, setEditing] = useState(false);
  const [pos, setPos] = useState(() => {
    try {
      const s = JSON.parse(localStorage.getItem('cd_pos'));
      if (s && typeof s.x === 'number' && typeof s.y === 'number') return s;
    } catch {}
    return { x: Math.max(8, window.innerWidth - 330), y: Math.max(0, window.innerHeight - 90) };
  });
  const [targets, setTargets] = useState(DEFAULT_TARGETS);
  const [, setTick] = useState(() => Date.now());
  // track whether we loaded from server at least once, to avoid overwriting server data
  const loadedRef = useRef(false);
  const saveTimerRef = useRef(null);

  const posRef = useRef(pos);
  posRef.current = pos;

  // Ticker
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Persist position locally
  useEffect(() => {
    localStorage.setItem('cd_pos', JSON.stringify(pos));
  }, [pos]);

  // Load from server on mount
  useEffect(() => {
    api.get('/api/countdown').then(({ data }) => {
      if (Array.isArray(data.targets) && data.targets.length > 0) {
        setTargets(data.targets);
      }
      loadedRef.current = true;
    }).catch(() => { loadedRef.current = true; });
  }, []);

  // Realtime: refresh when another user changes the targets
  useEffect(() => {
    const unsub = subscribeGlobalUpdates((evt) => {
      if (evt?.entity === 'countdown' && Array.isArray(evt.targets)) {
        setTargets(evt.targets);
      }
    });
    return () => unsub();
  }, []);

  // Debounced save: wait 800ms after targets change, then send to the API
  const saveTargets = useCallback((newTargets) => {
    if (!loadedRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      api.put('/api/countdown', { targets: newTargets }).catch(() => {});
    }, 800);
  }, []);

  const onMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX - posRef.current.x;
    const startY = e.clientY - posRef.current.y;

    const onMove = (evt) => {
      const x = Math.max(0, Math.min(window.innerWidth - 290, evt.clientX - startX));
      const y = Math.max(0, Math.min(window.innerHeight - 40, evt.clientY - startY));
      setPos({ x, y });
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  const onTouchStart = useCallback((e) => {
    const touch = e.touches[0];
    const startX = touch.clientX - posRef.current.x;
    const startY = touch.clientY - posRef.current.y;

    const onMove = (evt) => {
      evt.preventDefault();
      const t = evt.touches[0];
      const x = Math.max(0, Math.min(window.innerWidth - 290, t.clientX - startX));
      const y = Math.max(0, Math.min(window.innerHeight - 40, t.clientY - startY));
      setPos({ x, y });
    };

    const onEnd = () => {
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };

    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  }, []);

  const toggleMinimized = (e) => {
    e.stopPropagation();
    setMinimized((m) => {
      const next = !m;
      localStorage.setItem('cd_min', String(next));
      return next;
    });
  };

  // Recomputed on every render; the 1s ticker above triggers the re-render.
  const countdownRows = targets.map((t) => ({ ...t, left: getTimeLeft(t.date) }));

  const updateTarget = (id, field, value) => {
    setTargets((prev) => {
      const next = prev.map((t) => (t.id === id ? { ...t, [field]: value } : t));
      saveTargets(next);
      return next;
    });
  };

  const addTarget = () => {
    const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    setTargets((prev) => {
      const next = [...prev, { id: uid(), icon: '⏳', date: localDate }];
      saveTargets(next);
      return next;
    });
    setEditing(true);
    setMinimized(false);
  };

  const removeTarget = (id) => {
    setTargets((prev) => {
      const next = prev.filter((t) => t.id !== id);
      saveTargets(next);
      return next;
    });
  };

  // Only take up screen space when there is something to count down to;
  // the dashboard always shows it so countdowns can be added.
  if (!alwaysShow && targets.length === 0 && !editing) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        zIndex: 9999,
        width: 290,
        background: 'rgba(15, 23, 42, 0.92)',
        border: '1px solid rgba(99, 102, 241, 0.4)',
        borderRadius: 14,
        backdropFilter: 'blur(12px)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        userSelect: 'none',
        overflow: 'hidden',
        touchAction: 'none',
      }}
    >
      <div
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          justifyContent: 'space-between',
          padding: '8px 10px',
          cursor: 'grab',
          borderBottom: minimized ? 'none' : '1px solid rgba(99,102,241,0.2)',
        }}
      >
        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#94a3b8', letterSpacing: '0.05em' }}>
          COUNTDOWN
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEditing((v) => !v);
              setMinimized(false);
            }}
            style={smallBtnStyle}
            title="Edit countdowns"
          >
            Edit
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              addTarget();
            }}
            style={smallBtnStyle}
            title="Add a countdown"
          >
            +
          </button>
          <button onClick={toggleMinimized} style={smallBtnStyle} title={minimized ? 'Expand' : 'Collapse'}>
            {minimized ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {!minimized && (
        <div style={{ padding: '10px 10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {countdownRows.length === 0 && (
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', textAlign: 'center', padding: 8 }}>
              No countdowns. Add one with +.
            </div>
          )}

          {countdownRows.map((row) => (
            <div key={row.id} style={{ border: '1px solid rgba(100,116,139,0.25)', borderRadius: 10, padding: 8, background: 'rgba(2,6,23,0.5)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '1.05rem', minWidth: 22, textAlign: 'center' }}>{row.icon || '⏳'}</span>
                {row.left.invalid ? (
                  <span style={{ fontSize: '0.8rem', color: '#f87171', fontWeight: 600 }}>Invalid date</span>
                ) : row.left.done ? (
                  <span style={{ fontSize: '0.8rem', color: '#22c55e', fontWeight: 600 }}>Time's up</span>
                ) : (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <TimeUnit value={row.left.days} label="d" />
                    <Sep />
                    <TimeUnit value={row.left.hours} label="h" />
                    <Sep />
                    <TimeUnit value={row.left.minutes} label="m" />
                    <Sep />
                    <TimeUnit value={row.left.seconds} label="s" />
                  </div>
                )}
              </div>

              {editing && (
                <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '48px 1fr auto', gap: 6, alignItems: 'center' }}>
                  <input
                    type="text"
                    value={row.icon}
                    onChange={(e) => updateTarget(row.id, 'icon', emojiSlice(e.target.value, 1))}
                    style={editorInputStyle}
                    aria-label="Icon"
                  />
                  <input
                    type="datetime-local"
                    value={row.date}
                    onChange={(e) => updateTarget(row.id, 'date', e.target.value)}
                    style={editorInputStyle}
                    aria-label="Date"
                  />
                  <button
                    onClick={() => removeTarget(row.id)}
                    style={{ ...smallBtnStyle, color: '#f87171', borderColor: 'rgba(248,113,113,0.35)' }}
                    title="Delete"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const smallBtnStyle = {
  background: 'rgba(30,41,59,0.7)',
  border: '1px solid rgba(100,116,139,0.35)',
  color: '#cbd5e1',
  cursor: 'pointer',
  fontSize: '0.72rem',
  padding: '3px 7px',
  borderRadius: 6,
  lineHeight: 1.2,
};

const editorInputStyle = {
  background: 'rgba(15,23,42,0.7)',
  border: '1px solid rgba(100,116,139,0.35)',
  borderRadius: 6,
  color: '#e2e8f0',
  fontSize: '0.72rem',
  padding: '5px 6px',
};

function TimeUnit({ value, label }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 30 }}>
      <div
        style={{
          fontSize: '0.94rem',
          fontWeight: 700,
          color: '#f1f5f9',
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1,
        }}
      >
        {pad(value)}
      </div>
      <div style={{ fontSize: '0.56rem', color: '#64748b', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function Sep() {
  return <div style={{ color: '#475569', fontSize: '0.9rem', paddingBottom: 2, fontWeight: 700 }}>:</div>;
}
