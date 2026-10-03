import React, { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Check, Trash2, MessageCircle, Reply, Heart } from 'lucide-react';
import { api, getAuthToken } from '../api';
import { subscribeNotifications } from '../realtime';

const API_BASE = process.env.REACT_APP_API_URL || '';

function timeAgo(iso) {
  if (!iso) return '';
  const then = new Date(iso.endsWith('Z') ? iso : iso + 'Z');
  const diff = (Date.now() - then.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return then.toLocaleDateString('en-GB');
}

function Avatar({ user, size = 28 }) {
  const token = getAuthToken();
  const color = user?.color || '#6366f1';
  if (user?.avatar) {
    return (
      <img
        src={`${API_BASE}/api/profile/avatar/${user.id}?token=${token}`}
        alt=""
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${color}`, flexShrink: 0 }}
      />
    );
  }
  const initials = (user?.username || '?').slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 700, color: '#fff', flexShrink: 0,
      border: `2px solid ${color}`,
    }}>
      {initials}
    </div>
  );
}

const TYPE_META = {
  file_comment:  { icon: MessageCircle, color: '#06b6d4' },
  comment_reply: { icon: Reply,         color: '#a855f7' },
  comment_like:  { icon: Heart,         color: '#ec4899' },
  file_reaction: { icon: Heart,         color: '#ec4899' },
};

function renderText(n) {
  const md = n.metadata || {};
  switch (n.type) {
    case 'file_comment':
      return <>commented on your file{md.fileName ? <> — <em>{md.fileName}</em></> : null}{md.snippet ? <>: "{md.snippet}"</> : null}</>;
    case 'comment_reply':
      return <>replied to your comment{md.snippet ? <>: "{md.snippet}"</> : null}</>;
    case 'comment_like':
      return <>liked your comment{md.snippet ? <>: "{md.snippet}"</> : null}</>;
    case 'file_reaction':
      return <>reacted {md.emoji} to your file{md.fileName ? <> — <em>{md.fileName}</em></> : null}</>;
    default:
      return <>notification</>;
  }
}

export default function NotificationsPanel({ onOpenFile }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [dropStyle, setDropStyle] = useState({});
  const [dropOrigin, setDropOrigin] = useState('top right');
  const [showTopFade, setShowTopFade] = useState(false);
  const [showBottomFade, setShowBottomFade] = useState(false);

  const panelRef = useRef(null);
  const btnRef = useRef(null);
  const listRef = useRef(null);
  const justOpenedRef = useRef(false);

  const computeDropPosition = useCallback(() => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;

    const W = window.innerWidth;
    const H = window.innerHeight;
    const GAP = 12;
    const dropW = Math.min(360, W - GAP * 2);
    const dropHMax = Math.min(480, H - GAP * 2);

    let left = r.right - dropW;
    if (left < GAP) left = GAP;
    if (left + dropW > W - GAP) left = W - dropW - GAP;

    const spaceBelow = H - r.bottom - GAP;
    const openDown = spaceBelow >= 180;
    let availableHeight;
    let top;

    if (openDown) {
      availableHeight = Math.max(140, Math.min(dropHMax, H - (r.bottom + GAP) - GAP));
      top = Math.min(r.bottom + GAP, H - GAP - availableHeight);
    } else {
      availableHeight = Math.max(140, Math.min(dropHMax, r.top - GAP * 2));
      top = Math.max(GAP, r.top - GAP - availableHeight);
    }

    setDropStyle({ top, left, width: dropW, maxHeight: availableHeight });
    setDropOrigin(openDown ? 'top right' : 'bottom right');
  }, []);

  const syncListFades = useCallback(() => {
    const el = listRef.current;
    if (!el) {
      setShowTopFade(false);
      setShowBottomFade(false);
      return;
    }

    const { scrollTop, clientHeight, scrollHeight } = el;
    const hasOverflow = scrollHeight - clientHeight > 2;
    if (!hasOverflow) {
      setShowTopFade(false);
      setShowBottomFade(false);
      return;
    }

    setShowTopFade(scrollTop > 2);
    setShowBottomFade(scrollTop + clientHeight < scrollHeight - 2);
  }, []);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/api/notifications?limit=50');
      setItems(data.items);
      setUnread(data.unreadCount);
    } catch {}
  }, []);

  const loadUnread = useCallback(async () => {
    try {
      const { data } = await api.get('/api/notifications/unread-count');
      setUnread(data.unreadCount);
    } catch {}
  }, []);

  useEffect(() => {
    loadUnread();
    const unsub = subscribeNotifications((n) => {
      if (!n) return;
      setItems(prev => {
        if (prev.some(x => x.id === n.id)) return prev;
        return [n, ...prev].slice(0, 100);
      });
      setUnread(c => c + 1);
    });
    return () => unsub();
  }, [loadUnread]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(syncListFades);
    return () => cancelAnimationFrame(raf);
  }, [open, items, syncListFades]);

  useEffect(() => {
    if (!open) return;
    computeDropPosition();
    const close = (e) => {
      if (justOpenedRef.current) return;
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    const reposition = () => computeDropPosition();
    window.addEventListener('mousedown', close);
    window.addEventListener('touchstart', close, { passive: true });
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('touchstart', close);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, computeDropPosition]);

  const markOneRead = async (id) => {
    try {
      await api.patch(`/api/notifications/${id}/read`);
      setItems(prev => prev.map(n => n.id === id ? { ...n, readAt: n.readAt || new Date().toISOString() } : n));
      setUnread(c => Math.max(0, c - 1));
    } catch {}
  };

  const openNotificationTarget = async (n) => {
    if (!n) return;
    if (!n.readAt) await markOneRead(n.id);
    setOpen(false);

    const fileId = n.entityType === 'file' && n.entityId ? String(n.entityId) : null;
    if (fileId && onOpenFile) {
      onOpenFile(fileId);
    }
  };

  const markAll = async () => {
    await api.post('/api/notifications/read-all');
    setItems(prev => prev.map(n => ({ ...n, readAt: n.readAt || new Date().toISOString() })));
    setUnread(0);
  };

  const dismissOne = async (id) => {
    await api.delete(`/api/notifications/${id}`);
    setItems(prev => prev.filter(n => n.id !== id));
    loadUnread();
  };

  const dismissAll = async () => {
    await api.delete('/api/notifications');
    setItems([]);
    setUnread(0);
  };

  return (
    <div ref={panelRef} style={{ position: 'relative' }}>
      <button
        ref={btnRef}
        className="btn btn-ghost"
        onClick={() => {
          if (!open && btnRef.current) {
            computeDropPosition();

            justOpenedRef.current = true;
            requestAnimationFrame(() => { justOpenedRef.current = false; });
          }
          setOpen(o => !o);
        }}
        style={{ position: 'relative', padding: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
        aria-label="Notifications"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2,
            background: '#ef4444', color: '#fff',
            fontSize: '0.62rem', fontWeight: 700,
            borderRadius: 999, minWidth: 16, height: 16,
            padding: '0 4px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="notifications-dropdown"
            style={{
              position: 'fixed',
              top: dropStyle.top,
              left: dropStyle.left,
              width: dropStyle.width,
              transformOrigin: dropOrigin,
              maxHeight: dropStyle.maxHeight ? `${dropStyle.maxHeight}px` : 'calc(100dvh - 16px)',
              height: dropStyle.maxHeight ? `${dropStyle.maxHeight}px` : 'calc(100dvh - 16px)',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
              zIndex: 9999,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '12px 14px', borderBottom: '1px solid var(--border)',
            }}>
              <Bell size={14} color="var(--accent)" />
              <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Notifications</span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                {unread > 0 && (
                  <button className="btn btn-ghost btn-sm" onClick={markAll} title="Mark all as read" style={{ padding: '4px 8px', fontSize: '0.72rem' }}>
                    <Check size={12} /> Mark all read
                  </button>
                )}
                {items.length > 0 && (
                  <button className="btn btn-ghost btn-sm" onClick={dismissAll} title="Delete all" style={{ padding: '4px 8px', fontSize: '0.72rem' }}>
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 16,
                  pointerEvents: 'none',
                  opacity: showTopFade ? 1 : 0,
                  transition: 'opacity 0.16s ease',
                  background: 'linear-gradient(to bottom, rgba(2,6,23,0.34), rgba(2,6,23,0))',
                  zIndex: 2,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: 20,
                  pointerEvents: 'none',
                  opacity: showBottomFade ? 1 : 0,
                  transition: 'opacity 0.16s ease',
                  background: 'linear-gradient(to top, rgba(2,6,23,0.46), rgba(2,6,23,0))',
                  zIndex: 2,
                }}
              />
              <div
                ref={listRef}
                onScroll={syncListFades}
                style={{
                  height: '100%',
                  overflowY: 'auto',
                  overflowX: 'hidden',
                  overscrollBehavior: 'contain',
                  WebkitOverflowScrolling: 'touch',
                  touchAction: 'pan-y',
                }}
              >
              {items.length === 0 && (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  No notifications
                </div>
              )}
              {items.map(n => {
                const meta = TYPE_META[n.type] || {};
                const Icon = meta.icon;
                const isUnread = !n.readAt;
                return (
                  <div
                    key={n.id}
                    onClick={() => openNotificationTarget(n)}
                    style={{
                      display: 'flex', gap: 10, padding: '12px 14px',
                      borderBottom: '1px solid var(--border)',
                      background: isUnread ? 'rgba(99,102,241,0.06)' : 'transparent',
                      cursor: n.entityType === 'file' ? 'pointer' : 'default',
                    }}
                  >
                    <Avatar user={n.actor} size={32} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.82rem', lineHeight: 1.4, color: 'var(--text-secondary)' }}>
                        <span style={{ color: n.actor?.color || 'var(--accent)', fontWeight: 600 }}>
                          {n.actor?.username || 'unknown'}
                        </span>{' '}
                        {renderText(n)}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {Icon && <Icon size={11} color={meta.color} />}
                        {timeAgo(n.createdAt)}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        dismissOne(n.id);
                      }}
                      title="Close"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, alignSelf: 'flex-start' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
