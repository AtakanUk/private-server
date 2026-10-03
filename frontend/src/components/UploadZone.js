import React, { useCallback, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { api } from '../api';

export default function UploadZone({ onUploadComplete }) {
  const [uploads, setUploads] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const onDrop = useCallback(async acceptedFiles => {
    if (!acceptedFiles.length) return;
    setUploading(true);

    const items = acceptedFiles.map(f => ({ name: f.name, progress: 0, done: false, error: null }));
    setUploads(items);

    const formData = new FormData();
    acceptedFiles.forEach(f => formData.append('files', f));

    try {
      await api.post('/api/files/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: e => {
          const pct = Math.round((e.loaded * 100) / e.total);
          setUploads(prev => prev.map(u => ({ ...u, progress: pct })));
        }
      });
      setUploads(prev => prev.map(u => ({ ...u, progress: 100, done: true })));
      setTimeout(() => {
        setUploads([]);
        onUploadComplete?.();
      }, 1500);
    } catch (err) {
      setUploads(prev => prev.map(u => ({ ...u, error: 'Upload failed' })));
    } finally {
      setUploading(false);
    }
  }, [onUploadComplete]);

  const { getRootProps, isDragActive } = useDropzone({ onDrop, disabled: uploading, noClick: true });

  return (
    <div>
      {/* react-dropzone for drag-and-drop, our own input for clicks (no accept attr → Android opens the file manager) */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={e => { if (e.target.files.length) onDrop(Array.from(e.target.files)); e.target.value = ''; }}
      />
      <div {...getRootProps()} onClick={() => !uploading && fileInputRef.current?.click()} className={`upload-zone ${isDragActive ? 'active' : ''}`}>
        <div className="upload-zone-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </div>
        {isDragActive ? (
          <h3>Drop files here...</h3>
        ) : (
          <>
            <h3>Click or drag files here to upload</h3>
            <p>Photos, videos, music, PDFs, documents and more</p>
          </>
        )}
      </div>

      {uploads.length > 0 && (
        <div className="upload-progress">
          {uploads.map((u, i) => (
            <div key={i} className="upload-item">
              <div className="upload-item-info">
                <div className="upload-item-name">{u.name}</div>
                <div className="upload-item-bar">
                  <div className="upload-item-bar-fill" style={{ width: `${u.progress}%`, background: u.error ? '#ef4444' : u.done ? '#22c55e' : 'var(--accent)' }} />
                </div>
              </div>
              <span style={{ fontSize: '0.75rem', color: u.error ? '#ef4444' : u.done ? '#22c55e' : 'var(--text-muted)', minWidth: 40 }}>
                {u.error ? 'Error' : u.done ? 'OK' : `${u.progress}%`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
