import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { api, useAuth } from '../api';
import { formatBytes } from '../components/FileCard';
import { subscribeGlobalUpdates } from '../realtime';
import {
  FolderOpen, Image, Video, Music, FileText, BookImage,
  HardDrive, TrendingUp, Activity as ActivityIcon, Trash2,
} from 'lucide-react';
import ActivityFeed from '../components/ActivityFeed';
import UpdateLogPanel from '../components/UpdateLogPanel';

function useCountUp(target, duration = 800) {
  const [value, setValue] = useState(0);
  const prevTarget = useRef(0);

  useEffect(() => {
    if (target === prevTarget.current) return;
    const start = prevTarget.current;
    const diff = target - start;
    prevTarget.current = target;
    if (diff === 0) return;

    const startTime = performance.now();
    const tick = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(start + diff * ease));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, duration]);

  return value;
}

function StatCard({ label, value, icon: Icon, color, page, onClick, index }) {
  const displayValue = useCountUp(value);

  return (
    <motion.div
      className="stat-card"
      style={{ '--card-color': `${color}22` }}
      onClick={() => onClick(page)}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06, ease: [0.4, 0, 0.2, 1] }}
      whileHover={{ y: -3, transition: { duration: 0.2 } }}
      whileTap={{ scale: 0.97, transition: { duration: 0.1 } }}
    >
      <div className="stat-icon-wrap" style={{ background: `${color}22`, color }}>
        <Icon size={20} strokeWidth={2} />
      </div>
      <div>
        <div className="stat-value" style={{ color }}>{displayValue}</div>
        <div className="stat-label">{label}</div>
      </div>
    </motion.div>
  );
}

export default function DashboardPage({ setActivePage, openFile, openBoard }) {
  const { user } = useAuth();
  const isAdmin = !!user?.isAdmin;
  const [stats, setStats] = useState(null);
  const [feedKey, setFeedKey] = useState(0);

  const clearFeed = useCallback(async () => {
    if (!window.confirm('Clear the entire live feed history?')) return;
    try {
      await api.delete('/api/activity');
      setFeedKey(k => k + 1);
    } catch {}
  }, []);

  const fetchStats = useCallback(() => {
    api.get('/api/files/stats/storage').then((r) => setStats(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    fetchStats();
    const unsubscribe = subscribeGlobalUpdates(() => {
      fetchStats();
    });
    return () => unsubscribe();
  }, [fetchStats]);

  const statCards = stats ? [
    { label: 'Total files', value: stats.total_files || 0, icon: FolderOpen, color: '#6366f1', page: 'files' },
    { label: 'Photos', value: stats.images || 0, icon: Image, color: '#06b6d4', page: 'photos' },
    { label: 'Videos', value: stats.videos || 0, icon: Video, color: '#f59e0b', page: 'videos' },
    { label: 'Music', value: stats.audios || 0, icon: Music, color: '#a855f7', page: 'audio' },
    { label: 'Documents', value: stats.documents || 0, icon: FileText, color: '#22c55e', page: 'documents' },
    { label: 'Albums', value: stats.album_count || 0, icon: BookImage, color: '#ec4899', page: 'albums' },
  ] : [];

  return (
    <div className="page-stack">
      <motion.div
        className="topbar"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <TrendingUp size={22} color="var(--accent)" strokeWidth={2.5} />
          Dashboard
        </h1>
      </motion.div>

      {!stats && (
        <div className="page-section" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="unified-card" style={{ padding: '20px 16px', height: 84 }}>
              <div className="skeleton" style={{ height: '100%', borderRadius: 8 }} />
            </div>
          ))}
        </div>
      )}

      {stats && (
        <>
          <div className="page-section" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
            {statCards.map((s, i) => (
              <StatCard key={s.label} {...s} index={i} onClick={setActivePage} />
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.35 }}
            className="page-section"
          >
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 10, fontWeight: 600, letterSpacing: '0.04em' }}>
              QUICK ACCESS
            </div>
            <div className="quick-access-grid">
              <button className="unified-card quick-access-card" onClick={() => setActivePage('albums')}>
                <BookImage size={18} color="#ec4899" />
                <div>
                  <div className="quick-access-title">Albums</div>
                  <div className="quick-access-subtle">Quick open</div>
                </div>
              </button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.4 }}
            className="unified-card page-section"
            style={{ padding: '20px 24px' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                <HardDrive size={16} color="var(--accent)" />
                Total storage
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 500 }}>{formatBytes(stats.total_size)}</span>
            </div>
            <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: '100%' }}
                transition={{ duration: 0.8, delay: 0.5, ease: [0.4, 0, 0.2, 1] }}
                style={{
                  height: '100%',
                  background: 'linear-gradient(90deg, #6366f1, #06b6d4)',
                  borderRadius: 4,
                }}
              />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.5 }}
            className="page-section"
          >
            <UpdateLogPanel />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.55 }}
            className="unified-card page-section"
            style={{ overflow: 'hidden' }}
          >
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <ActivityIcon size={16} color="var(--accent)" />
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>Live feed</h3>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                everything happening on the server
              </span>
              {isAdmin && (
                <button
                  onClick={clearFeed}
                  style={{
                    marginLeft: 'auto', background: 'none',
                    border: '1px solid rgba(239,68,68,0.4)',
                    color: '#f87171', cursor: 'pointer', borderRadius: 6,
                    fontSize: '0.72rem', padding: '4px 10px',
                    display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
                  }}
                >
                  <Trash2 size={12} /> Clear all</button>
              )}
            </div>
            <ActivityFeed key={feedKey} limit={40} isAdmin={isAdmin} openFile={openFile} openBoard={openBoard} />
          </motion.div>
        </>
      )}
    </div>
  );
}
