import React from 'react';

export default function ConfirmDialog({ title, message, confirmText, cancelText, onConfirm, onCancel, danger }) {
  return (
    <div className="modal-overlay" onClick={onCancel} style={{ zIndex: 2000 }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420, width: '90vw' }}>
        <div className="modal-header">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={danger ? 'var(--danger)' : 'var(--warning)'} strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span className="modal-title">{title}</span>
          <button className="btn btn-ghost" onClick={onCancel} style={{ padding: 6, marginLeft: 'auto' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div style={{ padding: '20px 24px', color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
          {message}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary btn-sm" onClick={onCancel}>{cancelText || 'Cancel'}</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'} btn-sm`} onClick={onConfirm}>
            {confirmText || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
