import { useEffect, useRef, useState } from 'react';
import { getAuthToken, api } from '../api';
import { getFileProcessingBadge } from '../utils/videoPlayback';

const API_BASE = process.env.REACT_APP_API_URL || '';

const ICONS = {
  image: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <path d="M21 15l-5-5L5 21"/>
    </svg>
  ),
  video: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="4" width="15" height="16" rx="2"/>
      <path d="M17 8l5-4v16l-5-4V8z"/>
    </svg>
  ),
  audio: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M9 18V5l12-2v13"/>
      <circle cx="6" cy="18" r="3"/>
      <circle cx="18" cy="16" r="3"/>
    </svg>
  ),
  document: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <path d="M14 2v6h6M9 13h6M9 17h6M9 9h1"/>
    </svg>
  ),
};

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getExt(name) {
  return name.split('.').pop()?.toLowerCase() || '';
}

const EyeIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);

const EyeOffIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
    <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);

function UploaderSticker({ file }) {
  const token = getAuthToken();
  const color = file.uploader_color || '#6366f1';
  const name = file.uploader_username || '';
  const initials = (name.slice(0, 2) || '?').toUpperCase();

  if (file.uploader_avatar) {
    return (
      <img
        src={`${API_BASE}/api/profile/avatar/${file.user_id}?token=${token}`}
        alt=""
        title={name ? `Uploaded by ${name}` : 'Uploaded by'}
        className="uploader-sticker"
        style={{ borderColor: color }}
      />
    );
  }
  return (
    <div
      title={name ? `Uploaded by ${name}` : 'Uploaded by'}
      className="uploader-sticker uploader-sticker-fallback"
      style={{ background: color }}
    >
      {initials}
    </div>
  );
}

export default function FileCard({ file, onView, onDelete, onDownload, selected, selectionMode, onSelect, extraActions = [] }) {
  const token = getAuthToken();
  const thumbnailVersion = encodeURIComponent(file.thumbnail_updated_at || file.updated_at || file.created_at || '1');
  const [isBlurred, setIsBlurred] = useState(!!file.blurred);
  const [showReactions, setShowReactions] = useState(false);
  const [reactionGroups, setReactionGroups] = useState([]);
  const [loadingReactions, setLoadingReactions] = useState(false);
  const uploaderColor = file.uploader_color || null;
  const didLongPress = useRef(false);
  const reactionPanelRef = useRef(null);
  const processingBadge = getFileProcessingBadge(file);
  const previewEmojis = (file.reaction_preview || '').trim().split(/\s+/).filter(Boolean);
  const hiddenReactionCount = Math.max(0, (file.reaction_count || 0) - previewEmojis.length);

  useEffect(() => {
    setShowReactions(false);
    setReactionGroups([]);
    setLoadingReactions(false);
  }, [file.id]);

  useEffect(() => {
    if (!showReactions) return;
    const onPointerDown = (e) => {
      if (!reactionPanelRef.current) return;
      if (!reactionPanelRef.current.contains(e.target)) {
        setShowReactions(false);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('touchstart', onPointerDown, { passive: true });
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('touchstart', onPointerDown);
    };
  }, [showReactions]);

  const toggleBlur = async (e) => {
    e.stopPropagation();
    setIsBlurred(b => !b);
    try {
      const { data } = await api.patch(`/api/files/${file.id}/blur`);
      setIsBlurred(data.blurred);
    } catch {
      setIsBlurred(b => !b);
    }
  };

  const handleClick = (e) => {
    if (didLongPress.current) {
      didLongPress.current = false;
      return;
    }
    if (selectionMode) {
      onSelect?.(file.id, e);
      return;
    }
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      e.preventDefault();
      onSelect?.(file.id, e);
      return;
    }
    onView(file);
  };

  const toggleReactionsPanel = async (e) => {
    e.stopPropagation();
    const nextOpen = !showReactions;
    setShowReactions(nextOpen);
    if (!nextOpen || reactionGroups.length > 0 || loadingReactions || !file.reaction_count) return;

    setLoadingReactions(true);
    try {
      const { data } = await api.get(`/api/files/${file.id}/interactions`);
      setReactionGroups(Array.isArray(data?.reactions) ? data.reactions : []);
    } catch {
      setReactionGroups([]);
    } finally {
      setLoadingReactions(false);
    }
  };

  return (
    <div
      className={`file-card${selected ? ' selected' : ''}${selectionMode ? ' selection-mode' : ''}`}
      onClick={handleClick}
      data-file-id={file.id}
    >
      {/* Selection checkbox */}
      <div
        className="file-select-check"
        onClick={e => { e.stopPropagation(); onSelect?.(file.id, e); }}
        role="button"
        aria-label={selected ? 'Deselect' : 'Select file'}
      >
        {selected ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="var(--accent)" stroke="white" strokeWidth="2">
            <rect x="2" y="2" width="20" height="20" rx="4"/>
            <polyline points="7 13 10 16 17 9"/>
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="rgba(15,23,42,0.72)" stroke="var(--text-muted)" strokeWidth="2">
            <rect x="2" y="2" width="20" height="20" rx="4"/>
          </svg>
        )}
      </div>

      <div className="file-media">
        {file.thumbnail ? (
          <img
            className="file-thumbnail"
            src={`${API_BASE}/api/files/thumb/${file.id}?token=${token}&v=${thumbnailVersion}`}
            alt={file.original_name}
            loading="lazy"
            onLoad={e => e.currentTarget.classList.add('loaded')}
            style={isBlurred ? { filter: 'blur(16px)', transform: 'scale(1.05)' } : undefined}
          />
        ) : (
          <div className="file-icon-placeholder">
            {ICONS[file.category] || ICONS.document}
            <span className="file-ext">{getExt(file.original_name)}</span>
          </div>
        )}

        <UploaderSticker file={file} />
      </div>

      {processingBadge ? (
        <div className={`file-processing-badge file-processing-badge--${processingBadge.tone}`}>
          {processingBadge.label}
        </div>
      ) : null}

      <div className="file-info">
        <div
          className="file-name"
          title={file.original_name}
          style={uploaderColor ? { color: uploaderColor } : undefined}
        >
          {file.original_name}
        </div>
        <div className="file-meta">{formatBytes(file.size)}</div>
        <div className="file-social-meta">
          <span className="file-social-item" title="Comments">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
            </svg>
            {file.comment_count || 0}
          </span>
          <span className="file-social-item" title="Reactions">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z"/>
            </svg>
            {file.reaction_count || 0}
          </span>
          <div className="file-social-preview-wrap" ref={reactionPanelRef}>
            <button
              type="button"
              className="file-social-preview file-social-preview-btn"
              title="See reaction details"
              onClick={toggleReactionsPanel}
            >
              {previewEmojis.length ? previewEmojis.join(' ') : '—'}
              {hiddenReactionCount > 0 ? (
                <span className="file-social-preview-more">+{hiddenReactionCount}</span>
              ) : null}
            </button>

            {showReactions ? (
              <div className="file-reaction-popover" onClick={(e) => e.stopPropagation()}>
                {loadingReactions ? (
                  <div className="file-reaction-popover-empty">Loading...</div>
                ) : reactionGroups.length ? (
                  reactionGroups.map((group) => (
                    <div key={group.emoji} className="file-reaction-row">
                      <span className="file-reaction-emoji">{group.emoji}</span>
                      <span className="file-reaction-count">{group.count}</span>
                    </div>
                  ))
                ) : (
                  <div className="file-reaction-popover-empty">No reactions</div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {!selectionMode && (
        <div
          className="file-card-actions"
          onClick={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
          onTouchStart={e => e.stopPropagation()}
        >
          {extraActions.map((action) => (
            <button
              key={action.key}
              className={`file-action-btn${action.className ? ` ${action.className}` : ''}`}
              title={action.title}
              onClick={(e) => { e.stopPropagation(); action.onClick?.(file, e); }}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              style={action.style}
            >
              {action.icon}
            </button>
          ))}
          <button
            className="file-action-btn"
            title={isBlurred ? 'Unblur' : 'Blur'}
            onClick={toggleBlur}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            style={{
              background: isBlurred ? 'rgba(99,102,241,0.95)' : 'rgba(15,23,42,0.82)',
              color: isBlurred ? '#fff' : '#cbd5e1',
            }}
          >
            {isBlurred ? <EyeOffIcon /> : <EyeIcon />}
          </button>
          <button
            className="file-action-btn download"
            title="Download"
            onClick={(e) => { e.stopPropagation(); onDownload(file); }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </button>
          <button
            className="file-action-btn delete"
            title="Delete"
            onClick={(e) => { e.stopPropagation(); onDelete(file); }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

export { formatBytes };
