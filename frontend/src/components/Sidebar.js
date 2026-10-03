import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth, getAuthToken } from '../api';
import NotificationsPanel from './NotificationsPanel';

const API_BASE = process.env.REACT_APP_API_URL || '';

function SidebarAvatar({ user, size = 28 }) {
  const token = getAuthToken();
  const initials = (user?.username || '?').slice(0, 2).toUpperCase();
  const color = user?.color || '#6366f1';

  if (user?.avatar) {
    return (
      <img
        src={API_BASE + '/api/profile/avatar/' + user.id + '?token=' + token}
        alt={user.username}
        style={{
          width: size, height: size, borderRadius: '50%',
          objectFit: 'cover', border: '2px solid ' + color,
          flexShrink: 0,
        }}
      />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: color, display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontSize: size * 0.38,
      fontWeight: 700, color: '#fff', flexShrink: 0,
      border: '2px solid ' + color,
    }}>
      {initials}
    </div>
  );
}

export default function Sidebar({ activePage, setActivePage, onOpenFile }) {
  const { user, logout } = useAuth();
  const isAdmin = user?.isAdmin;
  const [open, setOpen] = useState(false);

  const adminSection = isAdmin ? [{
    section: 'Admin',
    items: [
      { key: 'admin', label: 'Admin panel', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14"/></svg> },
    ]
  }] : [];

  const navItems = [
    ...adminSection,
    {
      section: 'Main',
      items: [
        { key: 'dashboard', label: 'Dashboard', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> },
        { key: 'files', label: 'All files', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg> },
        { key: 'pinboards', label: 'Pinboards', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v6"/><path d="M5 8h14l-1 10a2 2 0 01-2 2H8a2 2 0 01-2-2z"/><circle cx="12" cy="13" r="2"/></svg> },
        { key: 'profile', label: 'My profile', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
      ]
    },
    {
      section: 'Categories',
      items: [
        { key: 'photos', label: 'Photos', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg> },
        { key: 'videos', label: 'Videos', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="15" height="16" rx="2"/><path d="M17 8l5-4v16l-5-4V8z"/></svg> },
        { key: 'audio', label: 'Music', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg> },
        { key: 'albums', label: 'Albums', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg> },
        { key: 'documents', label: 'Documents', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg> },
      ]
    }
  ];

  const handleNav = key => {
    setActivePage(key);
    setOpen(false);
  };

  return (
    <>
      <div className="mobile-header">
        <button className="btn btn-ghost" onClick={() => setOpen(true)} style={{ padding: 6 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <span style={{ fontWeight: 700, color: 'var(--accent)' }}>Private Server</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
          <NotificationsPanel onOpenFile={onOpenFile} />
          <button
            onClick={() => handleNav('profile')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <SidebarAvatar user={user} size={30} />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            className="sidebar-overlay show"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>

      <div className={"sidebar" + (open ? " open" : "")}>
        <div className="sidebar-logo">
          <h2>Private Server</h2>
        </div>

        {navItems.map(section => (
          <div className="nav-section" key={section.section}>
            <div className="nav-section-title">{section.section}</div>
            {section.items.map(item => (
              <button
                key={item.key}
                className={"nav-item" + (activePage === item.key ? " active" : "")}
                onClick={() => handleNav(item.key)}
                style={{ position: 'relative' }}
              >
                {activePage === item.key && (
                  <motion.div
                    layoutId="sidebar-active-pill"
                    className="sidebar-active-indicator"
                    transition={{ type: 'spring', stiffness: 380, damping: 36 }}
                  />
                )}
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        ))}

        <div className="sidebar-bottom">
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
            <NotificationsPanel onOpenFile={onOpenFile} />
          </div>
          <button
            onClick={() => handleNav('profile')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '6px 0', display: 'flex', alignItems: 'center', gap: 8,
              width: '100%', marginBottom: 8,
            }}
          >
            <SidebarAvatar user={user} size={32} />
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: user?.color || 'var(--accent)' }}>
                {user?.username}
              </div>
              {user?.email && (
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{user.email}</div>
              )}
            </div>
          </button>
          <button className="btn btn-secondary btn-sm" onClick={logout} style={{ width: '100%', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Sign out
          </button>
        </div>
      </div>
    </>
  );
}
