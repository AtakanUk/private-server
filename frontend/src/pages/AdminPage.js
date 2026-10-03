import React, { useState, useEffect } from 'react';
import { api } from '../api';
import LogViewer from '../components/LogViewer';

function formatBytes(bytes) {
  const n = Number(bytes || 0);
  if (!n) return '0 B';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(k)));
  return `${(n / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function AdminPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [activeTab, setActiveTab] = useState('users');

  const fetchUsers = () => {
    setLoading(true);
    api.get('/api/admin/users')
      .then(r => setUsers(r.data))
      .catch(() => setMsg({ text: 'Could not load users', type: 'error' }))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchUsers(); }, []);

  useEffect(() => {
    if (!selectedUserId) {
      setForm(null);
      return;
    }
    const u = users.find((x) => x.id === selectedUserId);
    if (!u) return;
    setForm({
      username: u.username || '',
      email: u.email || '',
      phone: u.phone || '',
      color: u.color || '#6366f1',
      uploadEmailNotifications: !!u.upload_email_notifications,
      isAdmin: !!u.is_admin,
    });
  }, [selectedUserId, users]);

  const showMsg = (text, type = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: '' }), 4000);
  };

  const handleResetPassword = async (user) => {
    const pass = window.prompt(`New password for "${user.username}" (min. 8 characters):`);
    if (!pass) return;
    if (pass.length < 8) { showMsg('At least 8 characters required', 'error'); return; }
    try {
      await api.patch(`/api/admin/users/${user.id}/password`, { password: pass });
      showMsg(`Password updated for ${user.username}`);
    } catch (err) {
      showMsg(err.response?.data?.error || 'Something went wrong', 'error');
    }
  };

  const handleSaveUser = async () => {
    if (!selectedUserId || !form) return;
    setSaving(true);
    try {
      await api.patch(`/api/admin/users/${selectedUserId}`, form);
      showMsg('User updated');
      fetchUsers();
    } catch (err) {
      showMsg(err.response?.data?.error || 'Something went wrong', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (user) => {
    if (!window.confirm(`Delete "${user.username}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/api/admin/users/${user.id}`);
      showMsg(`${user.username} deleted`);
      fetchUsers();
    } catch (err) {
      showMsg(err.response?.data?.error || 'Something went wrong', 'error');
    }
  };

  return (
    <div className="page-stack">
      <div className="topbar">
        <h1>Admin panel</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button
            className={`btn btn-sm ${activeTab === 'users' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('users')}
          >
            Users
          </button>
          <button
            className={`btn btn-sm ${activeTab === 'logs' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('logs')}
          >
            Logs
          </button>
        </div>
      </div>

      {msg.text && (
        <div className="page-section" style={{
          background: msg.type === 'error' ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)',
          border: `1px solid ${msg.type === 'error' ? 'rgba(239,68,68,0.4)' : 'rgba(34,197,94,0.3)'}`,
          color: msg.type === 'error' ? '#f87171' : '#22c55e',
          padding: '12px 16px', borderRadius: 8, fontSize: '0.875rem'
        }}>{msg.text}</div>
      )}

      {activeTab === 'logs' && <LogViewer users={users} />}

      {activeTab === 'users' && (
      <div className="unified-card page-section" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Users ({users.length})</h3>
        </div>

        {loading ? (
          <div style={{ padding: 32, textAlign: 'center' }}><div className="spinner" /></div>
        ) : (
          <div>
            {users.map((user, i) => (
              <div key={user.id} style={{
                padding: '16px 20px',
                borderBottom: i < users.length - 1 ? '1px solid var(--border)' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                flexWrap: 'wrap'
              }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
                    </svg>
                    {user.username}
                    {user.is_admin ? (
                      <span style={{ fontSize: '0.68rem', color: '#22c55e', border: '1px solid rgba(34,197,94,0.45)', borderRadius: 999, padding: '2px 7px' }}>
                        Admin
                      </span>
                    ) : null}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    {user.email
                      ? <span style={{ color: '#6366f1' }}>{user.email}</span>
                      : <span style={{ color: '#f59e0b' }}>No email on file</span>
                    }
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', background: 'var(--bg-tertiary, var(--border))', padding: '4px 10px', borderRadius: 6 }}>
                    {user.file_count} files
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {new Date(user.created_at).toLocaleDateString('en-GB')}
                  </div>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setSelectedUserId(user.id)}
                    title="Edit all details"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                    Edit
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleResetPassword(user)}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                      <path d="M7 11V7a5 5 0 0110 0v4"/>
                    </svg>
                    Reset password
                  </button>
                  <button
                    className="btn btn-sm"
                    style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}
                    onClick={() => handleDelete(user)}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                      <path d="M10 11v6"/><path d="M14 11v6"/>
                      <path d="M9 6V4h6v2"/>
                    </svg>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {activeTab === 'users' && selectedUserId && form && (() => {
        const user = users.find((u) => u.id === selectedUserId);
        if (!user) return null;
        return (
          <div className="unified-card page-section" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Edit user: {user.username}</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedUserId(null)}>Close</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <label style={{ display: 'grid', gap: 6, fontSize: '0.82rem' }}>
                <span>Username</span>
                <input className="form-input" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} />
              </label>
              <label style={{ display: 'grid', gap: 6, fontSize: '0.82rem' }}>
                <span>Email</span>
                <input className="form-input" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              </label>
              <label style={{ display: 'grid', gap: 6, fontSize: '0.82rem' }}>
                <span>Phone</span>
                <input className="form-input" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
              </label>
              <label style={{ display: 'grid', gap: 6, fontSize: '0.82rem' }}>
                <span>Color</span>
                <input className="form-input" type="color" value={form.color || '#6366f1'} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} />
              </label>
            </div>

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.84rem' }}>
                <input
                  type="checkbox"
                  checked={!!form.uploadEmailNotifications}
                  onChange={(e) => setForm((f) => ({ ...f, uploadEmailNotifications: e.target.checked }))}
                />
                Email on new uploads
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.84rem' }}>
                <input
                  type="checkbox"
                  checked={!!form.isAdmin || !!user.env_admin}
                  disabled={!!user.env_admin}
                  onChange={(e) => setForm((f) => ({ ...f, isAdmin: e.target.checked }))}
                />
                Grant admin rights
              </label>
            </div>

            <div style={{ marginTop: 14, fontSize: '0.82rem', color: 'var(--text-muted)', display: 'grid', gap: 4 }}>
              <div>Posts uploaded: {user.file_count}</div>
              <div>Images / Videos / Audio / Documents: {user.image_count} / {user.video_count} / {user.audio_count} / {user.document_count}</div>
              <div>Total size: {formatBytes(user.total_size)}</div>
              <div>Albums: {user.album_count} | Comments: {user.comment_count} | Reactions: {user.reaction_count}</div>
              <div>Last upload: {user.last_upload_at ? new Date(user.last_upload_at).toLocaleString('en-GB') : 'None'}</div>
            </div>

            <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-primary btn-sm" disabled={saving} onClick={handleSaveUser}>
                {saving ? 'Saving...' : 'Save changes'}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => handleResetPassword(user)}>Reset password</button>
              <button
                className="btn btn-sm"
                style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}
                onClick={() => handleDelete(user)}
              >
                Delete user
              </button>
            </div>
          </div>
        );
      })()}

      {activeTab === 'users' && (
      <div className="unified-card page-section" style={{ padding: '16px 20px' }}>
        <h3 style={{ margin: '0 0 12px', fontSize: '0.95rem' }}>About</h3>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.8 }}>
          <li>Passwords are hashed with bcrypt and can't be viewed; admins can only reset them.</li>
          <li>The admin account set via ADMIN_USERNAME can't lose its admin rights or be deleted.</li>
          <li>This page is only visible to admins.</li>
        </ul>
      </div>
      )}
    </div>
  );
}
