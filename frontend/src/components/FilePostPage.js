import React, { useEffect, useRef, useState } from 'react';
import { api, getAuthToken } from '../api';
import AlbumPickerModal from './AlbumPickerModal';
import FileInteractionsPanel from './FileInteractionsPanel';
import ImageViewer from './ImageViewer';
import { getVideoQualityStatusText, resolveRequestedVideoQuality } from '../utils/videoPlayback';

const API_BASE = process.env.REACT_APP_API_URL || '';

export default function FilePostPage({ file, onClose, onDelete, onDownload, onRename }) {
  const [showAlbumPicker, setShowAlbumPicker] = useState(false);
  const [showImageViewer, setShowImageViewer] = useState(false);
  const [selectedVideoQuality, setSelectedVideoQuality] = useState('auto');
  const [isSettingThumbnail, setIsSettingThumbnail] = useState(false);
  const [thumbnailFeedback, setThumbnailFeedback] = useState('');
  const closeRef = useRef(onClose);
  const videoRef = useRef(null);

  const token = getAuthToken();
  const viewUrl = `${API_BASE}/api/files/view/${file.id}?token=${token}`;
  const resolvedVideoQuality = resolveRequestedVideoQuality(file, selectedVideoQuality);
  const videoViewUrl = resolvedVideoQuality === 'original'
    ? `${API_BASE}/api/files/view/${file.id}?token=${token}`
    : `${API_BASE}/api/files/view/${file.id}?token=${token}&quality=${resolvedVideoQuality}`;
  const videoStatusText = getVideoQualityStatusText(file, selectedVideoQuality, resolvedVideoQuality);

  // Keep latest onClose without re-running history wiring on every parent render.
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  // Browser back button support for mobile post page.
  // This must only bind per file, otherwise cleanup can close the post unexpectedly.
  useEffect(() => {
    window.history.pushState({ postView: true, fileId: file.id }, '', window.location.pathname);

    const onPop = () => {
      closeRef.current?.();
    };
    window.addEventListener('popstate', onPop);

    return () => {
      window.removeEventListener('popstate', onPop);
    };
  }, [file.id]);

  useEffect(() => {
    setShowImageViewer(false);
    setSelectedVideoQuality('auto');
    setIsSettingThumbnail(false);
    setThumbnailFeedback('');
  }, [file.id]);

  useEffect(() => {
    document.body.classList.add('viewer-open');
    document.documentElement.classList.add('viewer-open');
    return () => {
      document.body.classList.remove('viewer-open');
      document.documentElement.classList.remove('viewer-open');
    };
  }, []);

  const handleClose = () => {
    window.history.back();
  };

  const handleSetThumbnailFromCurrentFrame = async () => {
    if (!videoRef.current || isSettingThumbnail) return;
    const currentTime = Number(videoRef.current.currentTime || 0);
    setIsSettingThumbnail(true);
    setThumbnailFeedback('Updating cover...');
    try {
      await api.post(`/api/files/${file.id}/thumbnail-at-time`, { time: currentTime });
      setThumbnailFeedback('Cover updated.');
      const version = encodeURIComponent(new Date().toISOString());
      if (videoRef.current) {
        videoRef.current.poster = `${API_BASE}/api/files/thumb/${file.id}?token=${token}&v=${version}`;
      }
    } catch {
      setThumbnailFeedback('Could not update cover.');
    } finally {
      setIsSettingThumbnail(false);
    }
  };

  const renderContent = () => {
    if (file.category === 'image') {
      return (
        <>
          <img
            src={viewUrl}
            alt={file.original_name}
            className="post-media-image"
            onClick={() => setShowImageViewer(true)}
            style={{ cursor: 'zoom-in' }}
          />
          {showImageViewer ? (
            <ImageViewer
              imageSrc={viewUrl}
              alt={file.original_name}
              onClose={() => setShowImageViewer(false)}
            />
          ) : null}
        </>
      );
    }
    if (file.category === 'video') {
      return (
        <div className="viewer-video-wrapper">
          <video
            key={videoViewUrl}
            ref={videoRef}
            controls
            className="post-media-video"
            playsInline
            preload="metadata"
            src={videoViewUrl}
          />
          <div className="viewer-video-toolbar">
            <label className="viewer-quality-label" htmlFor="post-quality-select">Quality</label>
            <select
              id="post-quality-select"
              className="viewer-quality-select"
              value={selectedVideoQuality}
              onChange={(e) => setSelectedVideoQuality(e.target.value)}
            >
              <option value="auto">Auto</option>
              <option value="1080p">1080p</option>
              <option value="720p">720p</option>
              <option value="360p">360p</option>
              <option value="original">Original</option>
            </select>
            <span className="viewer-quality-status">{videoStatusText}</span>
            <button
              type="button"
              className="viewer-thumbnail-btn"
              onClick={handleSetThumbnailFromCurrentFrame}
              disabled={isSettingThumbnail}
            >
              {isSettingThumbnail ? 'Setting...' : 'Use this frame as cover'}
            </button>
            {thumbnailFeedback ? (
              <span className="viewer-thumbnail-status">{thumbnailFeedback}</span>
            ) : null}
          </div>
        </div>
      );
    }
    if (file.category === 'audio') {
      return (
        <div className="post-media-audio">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="1.5">
            <path d="M9 18V5l12-2v13"/>
            <circle cx="6" cy="18" r="3"/>
            <circle cx="18" cy="16" r="3"/>
          </svg>
          <audio controls preload="metadata" src={viewUrl} />
        </div>
      );
    }
    if (file.mime_type === 'application/pdf') {
      return <iframe src={viewUrl} className="post-media-pdf" title={file.original_name} />;
    }
    return (
      <div className="post-media-fallback">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: 16, opacity: 0.4 }}>
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
          <path d="M14 2v6h6"/>
        </svg>
        <p>Preview is not available for this file type.</p>
      </div>
    );
  };

  return (
    <>
      <div className="file-post-page">
        <div className="file-post-header">
          <button className="post-back-btn" onClick={handleClose} aria-label="Back">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="19" y1="12" x2="5" y2="12"/>
              <polyline points="12 19 5 12 12 5"/>
            </svg>
          </button>
          <span className="post-title">{file.original_name}</span>
          <button className="post-header-btn" onClick={() => onRename?.(file)} title="Rename">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
        </div>

        <div className={`file-post-media${file.category === 'video' ? ' file-post-media--video' : ''}`}>
          {renderContent()}
        </div>

        <div className="file-post-actions">
          <button className="post-action-btn post-action-danger" onClick={() => onDelete(file)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
            </svg>
            <span>Delete</span>
          </button>
          <button className="post-action-btn" onClick={() => setShowAlbumPicker(true)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <path d="M21 15l-5-5L5 21"/>
            </svg>
            <span>Album</span>
          </button>
          <button className="post-action-btn" onClick={() => onDownload(file)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <span>Download</span>
          </button>
        </div>

        <div className="file-post-comments">
          <FileInteractionsPanel fileId={file.id} />
        </div>
      </div>

      {showAlbumPicker && (
        <AlbumPickerModal file={file} onClose={() => setShowAlbumPicker(false)} />
      )}
    </>
  );
}
