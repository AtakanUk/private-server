import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth, api } from '../api';

const cardVariants = {
  initial: { opacity: 0, scale: 0.94, y: 24 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.4, ease: [0.34, 1.56, 0.64, 1] } },
};

const tabVariants = {
  initial: { opacity: 0, x: 12 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.22, ease: [0.4, 0, 0.2, 1] } },
  exit: { opacity: 0, x: -12, transition: { duration: 0.15 } },
};

export default function LoginPage() {
  const { login } = useAuth();
  const [tab, setTab] = useState('login');
  const [form, setForm] = useState({ username: '', password: '', setupKey: '', newPassword: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [resetToken, setResetToken] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('reset');
    if (token) { setResetToken(token); setTab('reset'); }
  }, []);

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  const switchTab = t => { setTab(t); setError(''); setSuccess(''); };

  const handleLogin = async e => {
    e.preventDefault(); setError(''); setLoading(true);
    try { await login(form.username, form.password); }
    catch (err) { setError(err.response?.data?.error || 'Sign-in failed'); }
    finally { setLoading(false); }
  };

  const handleRegister = async e => {
    e.preventDefault(); setError(''); setSuccess(''); setLoading(true);
    try {
      await api.post('/api/auth/register', form);
      setSuccess('Account created! You can sign in now.');
      switchTab('login');
      setForm(f => ({ ...f, setupKey: '' }));
    } catch (err) { setError(err.response?.data?.error || 'Sign-up failed'); }
    finally { setLoading(false); }
  };

  const handleForgot = async e => {
    e.preventDefault(); setError(''); setSuccess(''); setLoading(true);
    try {
      const res = await api.post('/api/auth/forgot-password', { username: form.username });
      setSuccess(res.data.message);
    } catch (err) { setError(err.response?.data?.error || 'Request failed'); }
    finally { setLoading(false); }
  };

  const handleReset = async e => {
    e.preventDefault(); setError('');
    if (form.newPassword !== form.confirmPassword) { setError('Passwords do not match'); return; }
    setLoading(true);
    try {
      const res = await api.post('/api/auth/reset-password', { token: resetToken, password: form.newPassword });
      setSuccess(res.data.message);
      setResetToken('');
      window.history.replaceState({}, '', '/');
      setTimeout(() => switchTab('login'), 2000);
    } catch (err) { setError(err.response?.data?.error || 'Could not reset password'); }
    finally { setLoading(false); }
  };

  return (
    <div className="login-page">
      <motion.div
        className="login-card"
        variants={cardVariants}
        initial="initial"
        animate="animate"
        style={{ position: 'relative', zIndex: 1 }}
      >
        <motion.div
          style={{ textAlign: 'center', marginBottom: 20 }}
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15, duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
        >
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="1.5">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.3 }}
        >
          <h1>Private Server</h1>
          <p className="login-subtitle">Your group's private media space</p>
        </motion.div>

        {tab !== 'reset' && (
          <motion.div
            className="setup-tabs"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.3 }}
          >
            <button className={"setup-tab " + (tab === 'login' ? 'active' : '')} onClick={() => switchTab('login')}>Sign in</button>
            <button className={"setup-tab " + (tab === 'register' ? 'active' : '')} onClick={() => switchTab('register')}>Sign up</button>
            <button className={"setup-tab " + (tab === 'forgot' ? 'active' : '')} onClick={() => switchTab('forgot')}>Forgot password</button>
          </motion.div>
        )}

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ duration: 0.2 }}
              style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', color: '#f87171', padding: '12px 16px', borderRadius: 8, fontSize: '0.875rem', marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 8 }}
            >
              <span style={{ flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </span>
              <span style={{ flex: 1 }}>{error}</span>
              <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 18, padding: 0, flexShrink: 0, lineHeight: 1 }}>x</button>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {success && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e', padding: '12px 16px', borderRadius: 8, fontSize: '0.875rem', marginBottom: 16 }}
            >
              {success}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {tab === 'login' && (
            <motion.form
              key="login"
              variants={tabVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              onSubmit={handleLogin}
            >
              <div className="form-group">
                <label className="form-label">Username</label>
                <input className="form-input" name="username" type="text" autoCapitalize="none" required value={form.username} onChange={handleChange} placeholder="username" />
              </div>
              <div className="form-group">
                <label className="form-label">Password</label>
                <input className="form-input" name="password" type="password" required value={form.password} onChange={handleChange} placeholder="••••••••" />
              </div>
              <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}>
                {loading ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                    Signing in...
                  </span>
                ) : 'Sign in'}
              </button>
            </motion.form>
          )}

          {tab === 'register' && (
            <motion.form
              key="register"
              variants={tabVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              onSubmit={handleRegister}
            >
              <div className="form-group">
                <label className="form-label">Username</label>
                <input className="form-input" name="username" type="text" autoCapitalize="none" required value={form.username} onChange={handleChange} placeholder="username" />
              </div>
              <div className="form-group">
                <label className="form-label">Password (min. 8 characters)</label>
                <input className="form-input" name="password" type="password" required minLength={8} value={form.password} onChange={handleChange} placeholder="••••••••" />
              </div>
              <div className="form-group">
                <label className="form-label">Invite key</label>
                <input className="form-input" name="setupKey" type="password" required value={form.setupKey} onChange={handleChange} placeholder="Invite key (SETUP_KEY)" />
              </div>
              <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}>
                {loading ? 'Saving...' : 'Sign up'}
              </button>
            </motion.form>
          )}

          {tab === 'forgot' && (
            <motion.form
              key="forgot"
              variants={tabVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              onSubmit={handleForgot}
            >
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                Enter your username. If an email address is on file, we'll send you a reset link.
              </p>
              <div className="form-group">
                <label className="form-label">Username</label>
                <input className="form-input" name="username" type="text" autoCapitalize="none" required value={form.username} onChange={handleChange} placeholder="username" />
              </div>
              <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
                {loading ? 'Sending...' : 'Send reset link'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => switchTab('login')} style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
                Back to sign in
              </button>
            </motion.form>
          )}

          {tab === 'reset' && (
            <motion.form
              key="reset"
              variants={tabVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              onSubmit={handleReset}
            >
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 16 }}>Choose a new password.</p>
              <div className="form-group">
                <label className="form-label">New password (min. 8 characters)</label>
                <input className="form-input" name="newPassword" type="password" required minLength={8} value={form.newPassword} onChange={handleChange} placeholder="••••••••" />
              </div>
              <div className="form-group">
                <label className="form-label">Repeat password</label>
                <input className="form-input" name="confirmPassword" type="password" required minLength={8} value={form.confirmPassword} onChange={handleChange} placeholder="••••••••" />
              </div>
              <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
                {loading ? 'Saving...' : 'Update password'}
              </button>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
