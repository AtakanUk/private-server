import React, { useState, useEffect, useRef } from 'react';
import { api, getAuthToken, useAuth } from '../api';

const API_BASE = process.env.REACT_APP_API_URL || '';

const PALETTE = [
  '#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#f43f5e',
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6', '#0ea5e9', '#64748b', '#94a3b8',
];

function AvatarCircle({ user, size = 80 }) {
  const token = getAuthToken();
  const initials = (user?.username || '?').slice(0, 2).toUpperCase();
  const color = user?.color || '#6366f1';

  if (user?.avatar) {
    return (
      <img
        src={`${API_BASE}/api/profile/avatar/${user.id}?token=${token}`}
        alt={user.username}
        style={{
          width: size, height: size, borderRadius: '50%',
          objectFit: 'cover', border: `3px solid ${color}`,
          display: 'block',
        }}
      />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: color, display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontSize: size * 0.35,
      fontWeight: 700, color: '#fff', flexShrink: 0,
      border: `3px solid ${color}`,
    }}>
      {initials}
    </div>
  );
}

export default function ProfilePage() {
  const { refreshProfile } = useAuth();
  const [profile, setProfile] = useState(null);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [uploadEmailNotifications, setUploadEmailNotifications] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileInputRef = useRef();

  useEffect(() => {
    api.get('/api/profile').then(res => {
      setProfile(res.data);
      setEmail(res.data.email || '');
      setPhone(res.data.phone || '');
      setColor(res.data.color || '#6366f1');
      setUploadEmailNotifications(!!res.data.upload_email_notifications);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch('/api/profile', { email, phone, color, uploadEmailNotifications });
      setSaved(true);
      refreshProfile();
      setTimeout(() => setSaved(false), 2000);
    } catch {
      alert('Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    const formData = new FormData();
    formData.append('avatar', file);
    try {
      const res = await api.post('/api/profile/avatar', formData);
      setProfile(p => ({ ...p, avatar: res.data.avatar }));
      refreshProfile();
    } catch {
      alert('Could not upload avatar');
    } finally {
      setAvatarUploading(false);
      e.target.value = '';
    }
  };

  if (!profile) {
    return <div className="loading-spinner"><div className="spinner" /></div>;
  }

  const displayUser = { ...profile, color };

  return (
    <div>
      <div className="topbar">
        <h1>My profile</h1>
      </div>

      <div className="page-stack" style={{ maxWidth: 520, margin: '0 auto' }}>
        {/* Avatar section */}
        <div className="unified-card page-section" style={{
          padding: 28,
          display: 'flex', alignItems: 'center', gap: 24,
        }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <AvatarCircle user={displayUser} size={88} />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarUploading}
              title="Change photo"
              style={{
                position: 'absolute', bottom: 0, right: 0,
                width: 28, height: 28, borderRadius: '50%',
                border: '2px solid var(--background)',
                background: color, color: '#fff',
                cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                padding: 0,
              }}
            >
              {avatarUploading ? (
                <div style={{ width: 10, height: 10, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
              )}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
          </div>
          <div>
            <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
              {profile.username}
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Click the camera icon to change your profile photo
            </div>
          </div>
        </div>

        {/* Info section */}
        <div className="unified-card page-section" style={{
          padding: 28,
        }}>
          <h3 style={{ margin: '0 0 20px', fontSize: '0.95rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Details
          </h3>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 6, fontWeight: 500 }}>
              Email address
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 10,
                border: '1px solid var(--border)', background: 'var(--background)',
                color: 'var(--text-primary)', fontSize: '0.9rem',
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 6, fontWeight: 500 }}>
              Phone number
            </label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+1 555 123 4567"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 10,
                border: '1px solid var(--border)', background: 'var(--background)',
                color: 'var(--text-primary)', fontSize: '0.9rem',
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <label style={{
              display: 'flex', alignItems: 'center', gap: 10,
              fontSize: '0.86rem', color: 'var(--text-secondary)',
              cursor: 'pointer', userSelect: 'none',
            }}>
              <input
                type="checkbox"
                checked={uploadEmailNotifications}
                onChange={(e) => setUploadEmailNotifications(e.target.checked)}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              Email me when new files are uploaded
            </label>
            <div style={{ marginTop: 6, fontSize: '0.78rem', color: 'var(--text-muted)', marginLeft: 26 }}>
              When enabled, you get an email for every new upload.
            </div>
          </div>
        </div>

        {/* Color section */}
        <div className="unified-card page-section" style={{
          padding: 28,
        }}>
          <h3 style={{ margin: '0 0 6px', fontSize: '0.95rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Profile color
          </h3>
          <p style={{ margin: '0 0 18px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Used for your name on files and in your profile
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {PALETTE.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                title={c}
                style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: c, border: 'none', cursor: 'pointer',
                  outline: color === c ? `3px solid ${c}` : '3px solid transparent',
                  outlineOffset: 2,
                  boxShadow: color === c ? `0 0 0 2px var(--background), 0 0 0 4px ${c}` : 'none',
                  transition: 'all 0.15s', transform: color === c ? 'scale(1.15)' : 'scale(1)',
                }}
              />
            ))}
            {/* Custom color input */}
            <label title="Custom color" style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'var(--border)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden', position: 'relative',
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
              </svg>
              <input
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }}
              />
            </label>
          </div>
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 16, height: 16, borderRadius: '50%', background: color, flexShrink: 0 }} />
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{color}</span>
            <span style={{ fontSize: '0.82rem', color: color, fontWeight: 700 }}>Sample file name.jpg</span>
          </div>
        </div>

        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving}
          style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: '0.95rem' }}
        >
          {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save'}
        </button>
      </div>
    </div>
  );
}

