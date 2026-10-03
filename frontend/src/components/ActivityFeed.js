import React, { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, MessageCircle, Heart, Reply, Pin, Activity as ActivityIcon, Trash2,
} from 'lucide-react';
import { api, getAuthToken } from '../api';
import { subscribeActivity } from '../realtime';

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
        style={{
          width: size, height: size, borderRadius: '50%', objectFit: 'cover',
          border: `2px solid ${color}`, flexShrink: 0,
        }}
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
  file_uploaded:    { icon: Upload,        color: '#22c55e', label: 'uploaded' },
  file_comment:     { icon: MessageCircle, color: '#06b6d4', label: 'commented' },
  comment_reply:    { icon: Reply,         color: '#a855f7', label: 'replied' },
  file_reaction:    { icon: Heart,         color: '#ec4899', label: 'reacted' },
  pinboard_created: { icon: Pin,           color: '#f59e0b', label: 'created a board' },
};

function ActivityRow({ activity, onDelete, onOpen, isAdmin }) {
  const meta = TYPE_META[activity.type] || { icon: ActivityIcon, color: '#6366f1', label: activity.type };
  const Icon = meta.icon;
  const actor = activity.actor;
  const md = activity.metadata || {};

  let body = null;
  switch (activity.type) {
    case 'file_uploaded':
      body = <>uploaded a file: <strong>{md.name}</strong></>;
      break;
    case 'file_comment':
      body = <>commented on a file{md.fileName ? <> — <em>{md.fileName}</em></> : null}{md.snippet ? <>: "{md.snippet}"</> : null}</>;
      break;
    case 'comment_reply':
      body = <>replied to a comment{md.fileName ? <> — <em>{md.fileName}</em></> : null}{md.snippet ? <>: "{md.snippet}"</> : null}</>;
      break;
    case 'file_reaction':
      body = <>reacted {md.emoji} to a file{md.fileName ? <> — <em>{md.fileName}</em></> : null}</>;
      break;
    case 'pinboard_created':
      body = <>created a new board: <strong>{md.name}</strong></>;
      break;
    default:
      body = <>{meta.label}</>;
  }

  const clickable = !!onOpen && (
    (activity.entityType === 'file' && activity.entityId) ||
    (activity.entityType === 'pinboard' && activity.entityId)
  );

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      onClick={clickable ? () => onOpen(activity) : undefined}
      style={{
        display: 'flex', gap: 12, alignItems: 'flex-start',
        padding: '12px 14px',
        borderBottom: '1px solid var(--border)',
        cursor: clickable ? 'pointer' : 'default',
        transition: 'background 0.15s',
      }}
      whileHover={clickable ? { backgroundColor: 'rgba(99,102,241,0.06)' } : undefined}
    >
      <Avatar user={actor} size={32} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.85rem', lineHeight: 1.4, color: 'var(--text-secondary)' }}>
          <span style={{ color: actor?.color || 'var(--accent)', fontWeight: 600 }}>
            {actor?.username || 'unknown'}
          </span>{' '}
          {body}
        </div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon size={11} color={meta.color} />
          {timeAgo(activity.createdAt)}
        </div>
      </div>
      {isAdmin && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(activity.id); }}
          title="Delete"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#f87171', padding: 4, alignSelf: 'center',
            opacity: 0.7, flexShrink: 0,
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = '1'}
          onMouseLeave={e => e.currentTarget.style.opacity = '0.7'}
        >
          <Trash2 size={14} />
        </button>
      )}
    </motion.div>
  );
}

export default function ActivityFeed({ limit = 30, isAdmin = false, openFile, openBoard }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const seenRef = useRef(new Set());

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/api/activity?limit=${limit}`);
      setItems(data.items);
      seenRef.current = new Set(data.items.map(x => x.id));
    } catch {} finally { setLoading(false); }
  }, [limit]);

  useEffect(() => {
    load();
    const unsub = subscribeActivity((a) => {
      if (!a || seenRef.current.has(a.id)) return;
      seenRef.current.add(a.id);
      setItems(prev => [a, ...prev].slice(0, 200));
    });
    return () => unsub();
  }, [load]);

  const handleOpen = useCallback((activity) => {
    if (!activity) return;
    if (activity.entityType === 'file' && activity.entityId && openFile) {
      openFile(activity.entityId);
    } else if (activity.entityType === 'pinboard' && activity.entityId && openBoard) {
      openBoard(Number(activity.entityId));
    }
  }, [openFile, openBoard]);

  const deleteOne = useCallback(async (id) => {
    try {
      await api.delete(`/api/activity/${id}`);
      setItems(prev => prev.filter(a => a.id !== id));
      seenRef.current.delete(id);
    } catch {}
  }, []);

  if (loading) {
    return <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading...</div>;
  }

  if (!items.length) {
    return <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: '0.85rem' }}>No activity yet.</div>;
  }

  return (
    <div>
      <div style={{ maxHeight: 480, overflowY: 'auto' }}>
        <AnimatePresence initial={false}>
          {items.map(a => (
            <ActivityRow
              key={a.id}
              activity={a}
              isAdmin={isAdmin}
              onDelete={deleteOne}
              onOpen={handleOpen}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
