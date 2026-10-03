import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { authSocket } from './realtime';

const API_BASE = process.env.REACT_APP_API_URL || '';

const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  res => res,
  err => {
    // Don't auto-logout on login/reset endpoints. Only 401 means the session is
    // gone; 403 is a permission error and must not sign the user out.
    const url = err.config?.url || '';
    const isAuthEndpoint = url.includes('/api/auth/login') ||
      url.includes('/api/auth/forgot-password') ||
      url.includes('/api/auth/reset-password');

    if (!isAuthEndpoint && err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('username');
      localStorage.removeItem('isAdmin');
      window.location.reload();
    }
    return Promise.reject(err);
  }
);

export { api };

export function getAuthToken() {
  return localStorage.getItem('token') || '';
}

export function logEvent(event, details) {
  try {
    api.post('/api/log/event', { event, details }).catch(() => {});
  } catch {}
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (base) => {
    try {
      const pRes = await api.get('/api/profile');
      setUser(prev => ({ ...prev, ...base, ...pRes.data }));
    } catch {
      setUser(base);
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const username = localStorage.getItem('username');
    if (token && username) {
      authSocket(token);
      api.get('/api/auth/verify')
        .then(res => {
          const base = { username, isAdmin: res.data.isAdmin };
          fetchProfile(base);
        })
        .catch(() => { localStorage.clear(); })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [fetchProfile]);

  const login = useCallback(async (username, password) => {
    const res = await api.post('/api/auth/login', { username, password });
    localStorage.setItem('token', res.data.token);
    localStorage.setItem('username', res.data.username);
    authSocket(res.data.token);
    const base = { username: res.data.username, isAdmin: res.data.isAdmin };
    fetchProfile(base);
  }, [fetchProfile]);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    authSocket(null);
    setUser(null);
  }, []);

  const refreshProfile = useCallback(() => {
    if (!user) return;
    fetchProfile({ username: user.username, isAdmin: user.isAdmin });
  }, [user, fetchProfile]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
