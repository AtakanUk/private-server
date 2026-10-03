import React, { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AuthProvider, useAuth, api, getAuthToken, logEvent } from './api';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import FilesPage from './pages/FilesPage';
import Sidebar from './components/Sidebar';
import AdminPage from './pages/AdminPage';
import AlbumsPage from './pages/AlbumsPage';
import ProfilePage from './pages/ProfilePage';
import PinboardsPage from './pages/PinboardsPage';
import PinboardPage from './pages/PinboardPage';
import CountdownWidget from './components/CountdownWidget';

const PAGE_CATEGORY_MAP = {
  photos: 'image',
  videos: 'video',
  audio: 'audio',
  documents: 'document',
  files: 'all',
};

const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.4, 0, 0.2, 1] } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15, ease: [0.4, 0, 1, 1] } },
};

function AppContent() {
  const { user, loading } = useAuth();
  const [activePage, setActivePage] = useState('dashboard');
  const [activeBoardId, setActiveBoardId] = useState(null);
  const [focusFileId, setFocusFileId] = useState(null);

  const navigateTo = useCallback(page => {
    window.history.pushState({ page }, '', window.location.pathname);
    setActivePage(page);
    if (page !== 'pinboard') setActiveBoardId(null);
    if (page !== 'files') setFocusFileId(null);
    logEvent('page_view', { page });
  }, []);

  const openBoard = useCallback(boardId => {
    window.history.pushState({ page: 'pinboard', boardId }, '', window.location.pathname);
    setActiveBoardId(boardId);
    setActivePage('pinboard');
    logEvent('pinboard_opened', { boardId });
  }, []);

  const openFile = useCallback(fileId => {
    if (!fileId) return;
    window.history.pushState({ page: 'files', focusFileId: fileId }, '', window.location.pathname);
    setFocusFileId(fileId);
    setActivePage('files');
    logEvent('file_opened', { fileId });
  }, []);

  useEffect(() => {
    window.history.replaceState({ page: 'dashboard' }, '', window.location.pathname);
  }, []);

  useEffect(() => {
    const handlePopState = e => {
      if (e.state?.page) {
        setActivePage(e.state.page);
        if (e.state.page === 'pinboard' && e.state.boardId) {
          setActiveBoardId(e.state.boardId);
        } else {
          setActiveBoardId(null);
        }
        setFocusFileId(e.state.page === 'files' && e.state.focusFileId ? e.state.focusFileId : null);
      } else {
        window.history.pushState({ page: 'dashboard' }, '', window.location.pathname);
        setActivePage('dashboard');
        setActiveBoardId(null);
        setFocusFileId(null);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 16 }}>
        <div className="spinner" />
        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading...</span>
      </div>
    );
  }

  if (!user) return <LoginPage />;

  // Callers (AlbumsPage) show their own confirmation dialog first.
  const handleFileDelete = async file => {
    await api.delete('/api/files/' + file.id);
  };

  const handleFileDownload = file => {
    const API_BASE = process.env.REACT_APP_API_URL || '';
    const a = document.createElement('a');
    a.href = API_BASE + '/api/files/download/' + file.id + '?token=' + getAuthToken();
    a.download = file.original_name;
    a.click();
  };

  const handleFileRename = async (file) => {
    const newName = window.prompt('New file name:', file.original_name);
    if (!newName || newName === file.original_name) return;
    await api.patch('/api/files/' + file.id + '/rename', { name: newName });
  };

  const renderPage = () => {
    if (activePage === 'dashboard') return <DashboardPage setActivePage={navigateTo} openFile={openFile} openBoard={openBoard} />;
    if (activePage === 'admin') return <AdminPage />;
    if (activePage === 'profile') return <ProfilePage />;
    if (activePage === 'pinboards') return <PinboardsPage onOpenBoard={openBoard} />;
    if (activePage === 'pinboard' && activeBoardId) {
      return <PinboardPage key={activeBoardId} boardId={activeBoardId} onBack={() => navigateTo('pinboards')} />;
    }
    if (activePage === 'albums') return (
      <AlbumsPage
        onFileDelete={handleFileDelete}
        onFileDownload={handleFileDownload}
        onFileRename={handleFileRename}
      />
    );
    if (PAGE_CATEGORY_MAP[activePage]) {
      return (
        <FilesPage
          key={activePage}
          defaultCategory={PAGE_CATEGORY_MAP[activePage]}
          focusFileId={activePage === 'files' ? focusFileId : null}
          onFocusConsumed={() => setFocusFileId(null)}
        />
      );
    }
    return <DashboardPage setActivePage={navigateTo} openFile={openFile} openBoard={openBoard} />;
  };

  return (
    <div className="app-container">
      <div className="main-layout">
        <Sidebar activePage={activePage} setActivePage={navigateTo} onOpenFile={openFile} />
        <main className="content-area">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activePage}
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              style={{ width: '100%' }}
            >
              {renderPage()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <CountdownWidget alwaysShow={activePage === 'dashboard'} />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
