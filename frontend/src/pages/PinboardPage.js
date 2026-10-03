import React, { useEffect, useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Plus, StickyNote, Image as ImageIcon, Trash2, ThumbsUp, ThumbsDown, Upload, Link2, Unlink } from 'lucide-react';
import { api, getAuthToken, useAuth, logEvent } from '../api';
import { subscribePinboard } from '../realtime';
import FilePickerModal from '../components/FilePickerModal';

const API_BASE = process.env.REACT_APP_API_URL || '';
const BOARD_WIDTH = 20000;
const BOARD_HEIGHT = 20000;
const FIT_BASE_WIDTH = 3000;
const FIT_BASE_HEIGHT = 2000;
const MIN_ZOOM = 0.18;
const MAX_ZOOM = 1.8;

function touchDistance(t1, t2) {
  const dx = t2.clientX - t1.clientX;
  const dy = t2.clientY - t1.clientY;
  return Math.hypot(dx, dy);
}

function touchMidpoint(t1, t2) {
  return {
    x: (t1.clientX + t2.clientX) / 2,
    y: (t1.clientY + t2.clientY) / 2,
  };
}

function PinboardCard({
  item,
  onDrag,
  onResize,
  onDelete,
  onVote,
  onContentChange,
  onAttachNoteImage,
  onRemoveNoteImage,
  onConnectSelect,
  connectMode,
  connectSelected,
  canEdit,
  canDelete,
  boardId,
  zoom = 1,
  isPinching = false,
}) {
  const [local, setLocal] = useState({ x: item.x, y: item.y, w: item.width, h: item.height });
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(item.content || '');
  const dragRef = useRef(null);
  const cardRef = useRef(null);
  const interactingRef = useRef(false);
  const token = getAuthToken();

  useEffect(() => {
    if (interactingRef.current) return;
    setLocal({ x: item.x, y: item.y, w: item.width, h: item.height });
    setContent(item.content || '');
  }, [item.x, item.y, item.width, item.height, item.content]);

  const startDrag = (e) => {
    if (editing || isPinching || connectMode) return;
    if (e.touches && e.touches.length > 1) return;
    e.preventDefault();
    const startX = e.clientX ?? e.touches?.[0]?.clientX;
    const startY = e.clientY ?? e.touches?.[0]?.clientY;
    const origX = local.x;
    const origY = local.y;
    interactingRef.current = true;
    dragRef.current = { finalX: origX, finalY: origY, raf: null };

    const move = (ev) => {
      if (ev.touches && ev.touches.length > 1) return;
      if (ev.touches && ev.cancelable) ev.preventDefault();
      const cx = ev.clientX ?? ev.touches?.[0]?.clientX;
      const cy = ev.clientY ?? ev.touches?.[0]?.clientY;
      if (cx === undefined) return;
      const nx = origX + (cx - startX) / zoom;
      const ny = origY + (cy - startY) / zoom;
      dragRef.current.finalX = nx;
      dragRef.current.finalY = ny;
      if (dragRef.current.raf) return;
      dragRef.current.raf = requestAnimationFrame(() => {
        if (cardRef.current && dragRef.current) {
          cardRef.current.style.left = `${dragRef.current.finalX}px`;
          cardRef.current.style.top = `${dragRef.current.finalY}px`;
        }
        if (dragRef.current) dragRef.current.raf = null;
      });
    };

    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
      const active = dragRef.current;
      if (active?.raf) cancelAnimationFrame(active.raf);
      const finalX = active?.finalX;
      const finalY = active?.finalY;
      dragRef.current = null;
      interactingRef.current = false;
      setLocal(l => ({ ...l, x: finalX ?? l.x, y: finalY ?? l.y }));
      onDrag(item.id, finalX ?? origX, finalY ?? origY);
    };

    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', up);
  };

  const startResize = (e) => {
    if (isPinching || connectMode) return;
    if (e.touches && e.touches.length > 1) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX ?? e.touches?.[0]?.clientX;
    const startY = e.clientY ?? e.touches?.[0]?.clientY;
    const origW = local.w;
    const origH = local.h;
    interactingRef.current = true;
    dragRef.current = { finalW: origW, finalH: origH, raf: null };

    const move = (ev) => {
      if (ev.touches && ev.touches.length > 1) return;
      if (ev.touches && ev.cancelable) ev.preventDefault();
      const cx = ev.clientX ?? ev.touches?.[0]?.clientX;
      const cy = ev.clientY ?? ev.touches?.[0]?.clientY;
      if (cx === undefined) return;
      const nw = Math.max(120, origW + (cx - startX) / zoom);
      const nh = Math.max(80, origH + (cy - startY) / zoom);
      dragRef.current.finalW = nw;
      dragRef.current.finalH = nh;
      if (dragRef.current.raf) return;
      dragRef.current.raf = requestAnimationFrame(() => {
        if (cardRef.current && dragRef.current) {
          cardRef.current.style.width = `${dragRef.current.finalW}px`;
          cardRef.current.style.height = `${dragRef.current.finalH}px`;
        }
        if (dragRef.current) dragRef.current.raf = null;
      });
    };

    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
      const active = dragRef.current;
      if (active?.raf) cancelAnimationFrame(active.raf);
      const finalW = active?.finalW;
      const finalH = active?.finalH;
      dragRef.current = null;
      interactingRef.current = false;
      setLocal(l => ({ ...l, w: finalW ?? l.w, h: finalH ?? l.h }));
      onResize(item.id, finalW ?? origW, finalH ?? origH);
    };

    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', up);
  };

  const saveContent = () => {
    setEditing(false);
    if (content !== item.content) onContentChange(item.id, content);
  };

  const bg = item.color || (item.kind === 'note' ? '#fef3c7' : 'var(--bg-primary)');
  const noteImageUrl = item.kind === 'note' && item.noteImageFileId
    ? `${API_BASE}/api/files/view/${item.noteImageFileId}?token=${token}`
    : null;

  let voteBorder = '1px solid rgba(0,0,0,0.15)';
  if (item.likes > 0 && item.dislikes > 0) voteBorder = '2px solid #f59e0b';
  else if (item.likes > 0) voteBorder = '2px solid #22c55e';
  else if (item.dislikes > 0) voteBorder = '2px solid #ef4444';

  const connectRing = connectSelected
    ? '0 0 0 2px rgba(14,165,233,0.9), 0 10px 28px rgba(0,0,0,0.35)'
    : '0 4px 14px rgba(0,0,0,0.25)';

  const mediaUrl = item.kind === 'image' || item.kind === 'video'
    ? `${API_BASE}/api/pinboards/media/${item.filename}?token=${token}`
    : null;

  const fileRefUrl = item.kind === 'file_ref' && item.fileRefId
    ? `${API_BASE}/api/files/view/${item.fileRefId}?token=${token}`
    : null;
  const fileRefThumb = item.kind === 'file_ref' && item.fileRefId
    ? `${API_BASE}/api/files/thumb/${item.fileRefId}?token=${token}`
    : null;

  return (
    <div
      ref={cardRef}
      data-pinboard-card="1"
      onClick={(e) => {
        if (connectMode) {
          e.stopPropagation();
          onConnectSelect?.(item.id);
        } else {
          logEvent('pinboard_item_clicked', { itemId: item.id, kind: item.kind });
        }
      }}
      style={{
        position: 'absolute',
        left: local.x, top: local.y,
        width: local.w, height: local.h,
        background: bg,
        border: voteBorder,
        borderRadius: 8,
        boxShadow: connectRing,
        color: item.kind === 'note' ? '#1f2937' : 'inherit',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        zIndex: item.zIndex || 0,
        willChange: 'left, top, width, height',
      }}
    >
      <div
        onMouseDown={startDrag}
        onTouchStart={startDrag}
        style={{
          padding: '4px 8px',
          cursor: 'move',
          background: 'rgba(0,0,0,0.08)',
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: '0.7rem',
          color: item.kind === 'note' ? '#374151' : 'var(--text-muted)',
          userSelect: 'none',
          touchAction: 'none',
        }}
      >
        <span style={{ fontWeight: 600, color: item.authorColor || 'inherit' }}>
          {item.authorUsername}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {canDelete && (
            <button
              onClick={() => onDelete(item.id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 2 }}
              title="Delete"
            >
              <Trash2 size={12} />
            </button>
          )}
          {canEdit && item.kind === 'note' && (
            <button
              onClick={() => onAttachNoteImage?.(item.id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 2 }}
              title="Add image to note"
            >
              <ImageIcon size={12} />
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {item.kind === 'note' && (
          editing && canEdit ? (
            <textarea
              autoFocus
              value={content}
              onChange={e => setContent(e.target.value)}
              onBlur={saveContent}
              style={{
                flex: 1, width: '100%', padding: 10, resize: 'none',
                background: 'transparent', border: 'none', outline: 'none',
                color: 'inherit', fontSize: '0.88rem', fontFamily: 'inherit',
              }}
            />
          ) : (
            <div
              onDoubleClick={() => canEdit && setEditing(true)}
              style={{ flex: 1, padding: 10, fontSize: '0.88rem', whiteSpace: 'pre-wrap', overflow: 'auto', cursor: canEdit ? 'text' : 'default' }}
            >
              {noteImageUrl && (
                <div style={{ position: 'relative', marginBottom: 8 }}>
                  <img
                    src={noteImageUrl}
                    alt=""
                    draggable={false}
                    style={{ display: 'block', width: '100%', height: 'auto', objectFit: 'contain', borderRadius: 6, border: '1px solid rgba(0,0,0,0.12)' }}
                  />
                  {canEdit && (
                    <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 4 }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onAttachNoteImage?.(item.id);
                        }}
                        style={{
                          border: '1px solid rgba(0,0,0,0.25)',
                          background: 'rgba(255,255,255,0.85)',
                          color: '#111827',
                          borderRadius: 5,
                          padding: '2px 6px',
                          fontSize: 10,
                          cursor: 'pointer',
                        }}
                        title="Replace image"
                      >
                        Replace
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveNoteImage?.(item.id);
                        }}
                        style={{
                          border: '1px solid rgba(127,29,29,0.35)',
                          background: 'rgba(254,226,226,0.92)',
                          color: '#7f1d1d',
                          borderRadius: 5,
                          padding: '2px 6px',
                          fontSize: 10,
                          cursor: 'pointer',
                        }}
                        title="Remove image"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              )}
              {content || <span style={{ opacity: 0.5 }}>{canEdit ? 'Write a note (double-click)' : 'Empty note'}</span>}
            </div>
          )
        )}

        {item.kind === 'image' && mediaUrl && (
          <img src={mediaUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} draggable={false} />
        )}
        {item.kind === 'video' && mediaUrl && (
          <video src={mediaUrl} controls style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#000' }} />
        )}
        {item.kind === 'file_ref' && (
          <a href={fileRefUrl} target="_blank" rel="noreferrer" style={{ flex: 1, display: 'block', background: '#000' }}>
            <img src={fileRefThumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} draggable={false} />
          </a>
        )}
      </div>

      <div style={{
        padding: '4px 8px', display: 'flex', gap: 8, alignItems: 'center',
        background: 'rgba(0,0,0,0.08)', fontSize: '0.72rem',
        color: item.kind === 'note' ? '#374151' : 'var(--text-muted)',
      }}>
        <button
          onClick={() => onVote(item.id, item.myVote === 1 ? 0 : 1)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: item.myVote === 1 ? '#22c55e' : 'inherit', display: 'flex', alignItems: 'center', gap: 3 }}
          title="Like"
        >
          <ThumbsUp size={12} /> {item.likes}
        </button>
        <button
          onClick={() => onVote(item.id, item.myVote === -1 ? 0 : -1)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: item.myVote === -1 ? '#ef4444' : 'inherit', display: 'flex', alignItems: 'center', gap: 3 }}
          title="Dislike"
        >
          <ThumbsDown size={12} /> {item.dislikes}
        </button>
        <div
          onMouseDown={startResize}
          onTouchStart={startResize}
          style={{
            marginLeft: 'auto', width: 14, height: 14, cursor: 'nwse-resize',
            background: 'linear-gradient(135deg, transparent 40%, currentColor 40%, currentColor 50%, transparent 50%, transparent 70%, currentColor 70%, currentColor 80%, transparent 80%)',
            opacity: 0.5,
            touchAction: 'none',
          }}
          title="Resize"
        />
      </div>
    </div>
  );
}

export default function PinboardPage({ boardId, onBack }) {
  const { user } = useAuth();
  const [board, setBoard] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [isPinching, setIsPinching] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [noteImagePickerItemId, setNoteImagePickerItemId] = useState(null);
  const [links, setLinks] = useState([]);
  const [connectMode, setConnectMode] = useState(false);
  const [connectFromItemId, setConnectFromItemId] = useState(null);
  const [miniViewport, setMiniViewport] = useState({ left: 0, top: 0, width: 0.15, height: 0.15 });
  const miniMapRef = useRef(null);
  const miniDragRef = useRef(null);
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);
  const zoomRef = useRef(1);
  const pinchRef = useRef(null);
  const isPinchingRef = useRef(false);
  const panDragRef = useRef(null);
  const panTouchRef = useRef(null);
  const centeredRef = useRef(false);
  const inertiaRef = useRef(null);
  const viewportKey = `pinboard-viewport-${boardId}`;

  const cancelInertia = () => {
    if (inertiaRef.current) {
      cancelAnimationFrame(inertiaRef.current);
      inertiaRef.current = null;
    }
  };

  const startInertia = (el, vx, vy) => {
    const friction = 0.94;
    const minV = 0.02;
    let vxCur = vx;
    let vyCur = vy;
    let lastFrame = performance.now();
    const step = () => {
      const now = performance.now();
      const dt = now - lastFrame;
      lastFrame = now;
      const decay = Math.pow(friction, dt / 16.67);
      vxCur *= decay;
      vyCur *= decay;
      if (Math.abs(vxCur) < minV && Math.abs(vyCur) < minV) {
        inertiaRef.current = null;
        return;
      }
      const prevL = el.scrollLeft;
      const prevT = el.scrollTop;
      el.scrollLeft = prevL + vxCur * dt;
      el.scrollTop = prevT + vyCur * dt;
      if (el.scrollLeft === prevL) vxCur = 0;
      if (el.scrollTop === prevT) vyCur = 0;
      inertiaRef.current = requestAnimationFrame(step);
    };
    inertiaRef.current = requestAnimationFrame(step);
  };

  const clampZoom = (z) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  const applyZoom = useCallback((nextZoom) => {
    const next = clampZoom(nextZoom);
    const el = canvasRef.current;
    if (!el) {
      setZoom(next);
      return;
    }
    const prev = zoom;
    const centerX = el.scrollLeft + el.clientWidth / 2;
    const centerY = el.scrollTop + el.clientHeight / 2;
    const logicalX = centerX / prev;
    const logicalY = centerY / prev;

    setZoom(next);
    requestAnimationFrame(() => {
      const nx = logicalX * next - el.clientWidth / 2;
      const ny = logicalY * next - el.clientHeight / 2;
      el.scrollLeft = Math.max(0, nx);
      el.scrollTop = Math.max(0, ny);
    });
  }, [zoom]);

  const zoomIn = () => applyZoom(zoom + 0.1);
  const zoomOut = () => applyZoom(zoom - 0.1);
  const zoomReset = () => applyZoom(1);
  const zoomFit = () => {
    const el = canvasRef.current;
    if (!el) return;
    const fitZoom = clampZoom(Math.min((el.clientWidth - 24) / FIT_BASE_WIDTH, (el.clientHeight - 24) / FIT_BASE_HEIGHT));
    applyZoom(fitZoom);
  };

  useEffect(() => {
    if (loading) return;
    const el = canvasRef.current;
    if (!el || centeredRef.current) return;
    centeredRef.current = true;

    const applyScroll = (sl, st) => {
      requestAnimationFrame(() => {
        el.scrollLeft = sl;
        el.scrollTop = st;
      });
    };

    const fitToItems = () => {
      if (items.length > 0) {
        const bucketSize = 1400;
        const buckets = new Map();
        for (const it of items) {
          const cx = it.x + (it.width || 0) / 2;
          const cy = it.y + (it.height || 0) / 2;
          const bx = Math.floor(cx / bucketSize);
          const by = Math.floor(cy / bucketSize);
          const key = `${bx}:${by}`;
          const prev = buckets.get(key) || { count: 0, sumX: 0, sumY: 0 };
          prev.count += 1;
          prev.sumX += cx;
          prev.sumY += cy;
          buckets.set(key, prev);
        }
        let best = null;
        for (const v of buckets.values()) {
          if (!best || v.count > best.count) best = v;
        }
        const cx = best ? best.sumX / best.count : BOARD_WIDTH / 2;
        const cy = best ? best.sumY / best.count : BOARD_HEIGHT / 2;
        applyScroll(cx * zoomRef.current - el.clientWidth / 2, cy * zoomRef.current - el.clientHeight / 2);
      } else {
        applyScroll(BOARD_WIDTH / 2 - el.clientWidth / 2, BOARD_HEIGHT / 2 - el.clientHeight / 2);
      }
    };

    fitToItems();
  }, [loading, items, viewportKey, boardId]);

  useEffect(() => {
    if (loading) return;
    const el = canvasRef.current;
    if (!el) return;
    let localTimer = null;
    let remoteTimer = null;

    const persistLocal = () => {
      try {
        localStorage.setItem(viewportKey, JSON.stringify({
          scrollLeft: el.scrollLeft,
          scrollTop: el.scrollTop,
          zoom: zoomRef.current,
        }));
      } catch {}
    };

    const persistRemote = () => {
      api.put(`/api/pinboards/${boardId}/viewport`, {
        scrollLeft: el.scrollLeft,
        scrollTop: el.scrollTop,
        zoom: zoomRef.current,
      }).catch(() => {});
    };

    const onScroll = () => {
      if (localTimer) clearTimeout(localTimer);
      localTimer = setTimeout(persistLocal, 250);
      if (remoteTimer) clearTimeout(remoteTimer);
      remoteTimer = setTimeout(persistRemote, 1200);
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      if (localTimer) clearTimeout(localTimer);
      if (remoteTimer) clearTimeout(remoteTimer);
      persistLocal();
      persistRemote();
      el.removeEventListener('scroll', onScroll);
    };
  }, [loading, viewportKey, boardId]);

  useEffect(() => {
    if (loading) return;
    const el = canvasRef.current;
    if (!el) return;

    const updateMiniViewport = () => {
      const totalW = BOARD_WIDTH * zoomRef.current;
      const totalH = BOARD_HEIGHT * zoomRef.current;
      const left = Math.max(0, Math.min(1, el.scrollLeft / Math.max(1, totalW)));
      const top = Math.max(0, Math.min(1, el.scrollTop / Math.max(1, totalH)));
      const width = Math.max(0.03, Math.min(1, el.clientWidth / Math.max(1, totalW)));
      const height = Math.max(0.03, Math.min(1, el.clientHeight / Math.max(1, totalH)));
      setMiniViewport({ left, top, width, height });
    };

    updateMiniViewport();
    el.addEventListener('scroll', updateMiniViewport, { passive: true });
    window.addEventListener('resize', updateMiniViewport, { passive: true });
    return () => {
      el.removeEventListener('scroll', updateMiniViewport);
      window.removeEventListener('resize', updateMiniViewport);
    };
  }, [loading, zoom, items.length]);

  useEffect(() => {
    if (loading) return;
    const el = canvasRef.current;
    if (!el) return;

    const onTouchStart = (e) => {
      cancelInertia();
      if (e.touches.length === 1) {
        const target = e.target;
        if (!target.closest('[data-pinboard-card="1"]')) {
          const t = e.touches[0];
          panTouchRef.current = {
            startX: t.clientX,
            startY: t.clientY,
            startLeft: el.scrollLeft,
            startTop: el.scrollTop,
            lastT: performance.now(),
            lastScrollLeft: el.scrollLeft,
            lastScrollTop: el.scrollTop,
            vx: 0,
            vy: 0,
          };
        }
        return;
      }
      if (e.touches.length < 2) return;
      if (e.cancelable) e.preventDefault();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const rect = el.getBoundingClientRect();
      const startMidGlobal = touchMidpoint(t1, t2);
      const startMid = { x: startMidGlobal.x - rect.left, y: startMidGlobal.y - rect.top };
      isPinchingRef.current = true;
      setIsPinching(true);
      pinchRef.current = {
        startDist: touchDistance(t1, t2),
        startZoom: zoomRef.current,
        startScrollLeft: el.scrollLeft,
        startScrollTop: el.scrollTop,
        startMid,
      };
    };

    const onTouchMove = (e) => {
      if (e.touches.length === 1 && panTouchRef.current && !pinchRef.current) {
        if (e.cancelable) e.preventDefault();
        const t = e.touches[0];
        const pan = panTouchRef.current;
        const dx = t.clientX - pan.startX;
        const dy = t.clientY - pan.startY;
        const nl = pan.startLeft - dx;
        const nt = pan.startTop - dy;
        el.scrollLeft = nl;
        el.scrollTop = nt;
        const now = performance.now();
        const dtMs = Math.max(1, now - pan.lastT);
        const ivx = (nl - pan.lastScrollLeft) / dtMs;
        const ivy = (nt - pan.lastScrollTop) / dtMs;
        pan.vx = pan.vx * 0.6 + ivx * 0.4;
        pan.vy = pan.vy * 0.6 + ivy * 0.4;
        pan.lastScrollLeft = nl;
        pan.lastScrollTop = nt;
        pan.lastT = now;
        return;
      }
      if (e.touches.length < 2 || !pinchRef.current) return;
      e.preventDefault();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const currDist = touchDistance(t1, t2);
      const rect = el.getBoundingClientRect();
      const currMidGlobal = touchMidpoint(t1, t2);
      const currMid = { x: currMidGlobal.x - rect.left, y: currMidGlobal.y - rect.top };
      const p = pinchRef.current;
      if (!p.startDist) return;

      const next = clampZoom(p.startZoom * (currDist / p.startDist));
      const logicalX = (p.startScrollLeft + p.startMid.x) / p.startZoom;
      const logicalY = (p.startScrollTop + p.startMid.y) / p.startZoom;

      setZoom(next);
      el.scrollLeft = Math.max(0, logicalX * next - currMid.x);
      el.scrollTop = Math.max(0, logicalY * next - currMid.y);
    };

    const endPinch = () => {
      const pan = panTouchRef.current;
      if (pan && !pinchRef.current) {
        const speed = Math.hypot(pan.vx, pan.vy);
        const now = performance.now();
        if (speed > 0.05 && now - pan.lastT < 120) {
          startInertia(el, pan.vx, pan.vy);
        }
      }
      panTouchRef.current = null;
      if (pinchRef.current) pinchRef.current = null;
      isPinchingRef.current = false;
      setIsPinching(false);
    };

    // Disable iOS Safari viewport pinch-zoom inside the board area.
    const blockGestureZoom = (e) => {
      if (el.contains(e.target) && e.cancelable) e.preventDefault();
    };

    el.addEventListener('touchstart', onTouchStart, { passive: false, capture: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
    el.addEventListener('touchend', endPinch, { passive: true });
    el.addEventListener('touchcancel', endPinch, { passive: true });
    window.addEventListener('gesturestart', blockGestureZoom, { passive: false });
    window.addEventListener('gesturechange', blockGestureZoom, { passive: false });
    window.addEventListener('gestureend', blockGestureZoom, { passive: false });

    return () => {
      el.removeEventListener('touchstart', onTouchStart, { capture: true });
      el.removeEventListener('touchmove', onTouchMove, { capture: true });
      el.removeEventListener('touchend', endPinch);
      el.removeEventListener('touchcancel', endPinch);
      window.removeEventListener('gesturestart', blockGestureZoom);
      window.removeEventListener('gesturechange', blockGestureZoom);
      window.removeEventListener('gestureend', blockGestureZoom);
    };
  }, [loading]);

  const startBackgroundPan = (e) => {
    if (!canvasRef.current) return;
    if (e.button !== 0 && e.button !== 1) return;
    if (e.target.closest('[data-pinboard-card="1"]')) return;
    e.preventDefault();
    cancelInertia();
    const el = canvasRef.current;
    panDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startLeft: el.scrollLeft,
      startTop: el.scrollTop,
    };
    el.style.cursor = 'grabbing';

    const move = (ev) => {
      if (!panDragRef.current || !canvasRef.current) return;
      const dx = ev.clientX - panDragRef.current.startX;
      const dy = ev.clientY - panDragRef.current.startY;
      canvasRef.current.scrollLeft = panDragRef.current.startLeft - dx;
      canvasRef.current.scrollTop = panDragRef.current.startTop - dy;
    };

    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      panDragRef.current = null;
      if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
    };

    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/api/pinboards/${boardId}`);
      setBoard(data.board);
      setItems(data.items);
      setLinks(Array.isArray(data.links) ? data.links : []);
    } catch {} finally { setLoading(false); }
  }, [boardId]);

  useEffect(() => {
    load();
    const unsub = subscribePinboard(boardId, (evt) => {
      if (evt.boardId !== Number(boardId)) return;
      if (evt.action === 'item-created' || evt.action === 'item-updated' || evt.action === 'item-voted') {
        setItems(prev => {
          const exists = prev.some(i => i.id === evt.item.id);
          return exists ? prev.map(i => i.id === evt.item.id ? evt.item : i) : [...prev, evt.item];
        });
      }
      if (evt.action === 'item-deleted') {
        setItems(prev => prev.filter(i => i.id !== evt.itemId));
        setLinks(prev => prev.filter(l => l.fromItemId !== evt.itemId && l.toItemId !== evt.itemId));
      }
      if (evt.action === 'link-created' && evt.link) {
        setLinks(prev => prev.some(l => l.id === evt.link.id) ? prev : [...prev, evt.link]);
      }
      if (evt.action === 'link-deleted') {
        setLinks(prev => prev.filter(l => l.id !== evt.linkId));
      }
    });
    return () => unsub();
  }, [boardId, load]);

  const rand = (max) => Math.floor(Math.random() * max);
  const spawnPos = () => {
    const el = canvasRef.current;
    if (!el) return { x: BOARD_WIDTH / 2 + rand(200), y: BOARD_HEIGHT / 2 + rand(120) };
    const centerX = (el.scrollLeft + el.clientWidth / 2) / zoom;
    const centerY = (el.scrollTop + el.clientHeight / 2) / zoom;
    return { x: centerX - 120 + rand(240), y: centerY - 80 + rand(160) };
  };

  const addNote = async () => {
    setMenuOpen(false);
    const { x, y } = spawnPos();
    const { data } = await api.post(`/api/pinboards/${boardId}/items`, { kind: 'note', content: '', x, y, width: 220, height: 160, color: '#fef3c7' });
    setItems(prev => [...prev, data.item]);
  };

  const pickFile = () => { setMenuOpen(false); fileInputRef.current?.click(); };

  const uploadFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    const { x, y } = spawnPos();
    fd.append('file', file);
    fd.append('x', x); fd.append('y', y); fd.append('width', 260); fd.append('height', 200);
    const { data } = await api.post(`/api/pinboards/${boardId}/items/upload`, fd);
    setItems(prev => [...prev, data.item]);
    e.target.value = '';
  };

  const addFileRef = async (fileId) => {
    setPickerOpen(false);
    const { x, y } = spawnPos();
    const { data } = await api.post(`/api/pinboards/${boardId}/items`, { kind: 'file_ref', fileRefId: fileId, x, y, width: 240, height: 180 });
    setItems(prev => [...prev, data.item]);
  };

  const handleDrag = async (itemId, x, y) => {
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, x, y } : i));
    try { await api.patch(`/api/pinboards/${boardId}/items/${itemId}`, { x, y }); } catch {}
  };

  const handleResize = async (itemId, width, height) => {
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, width, height } : i));
    try { await api.patch(`/api/pinboards/${boardId}/items/${itemId}`, { width, height }); } catch {}
  };

  const handleDelete = async (itemId) => {
    if (!window.confirm('Delete this card?')) return;
    try {
      await api.delete(`/api/pinboards/${boardId}/items/${itemId}`);
      setItems(prev => prev.filter(i => i.id !== itemId));
    } catch {}
  };

  const handleVote = async (itemId, vote) => {
    try {
      const { data } = await api.post(`/api/pinboards/${boardId}/items/${itemId}/vote`, { vote });
      setItems(prev => prev.map(i => i.id === itemId ? data.item : i));
    } catch {}
  };

  const handleContent = async (itemId, content) => {
    try {
      const { data } = await api.patch(`/api/pinboards/${boardId}/items/${itemId}`, { content });
      setItems(prev => prev.map(i => i.id === itemId ? data.item : i));
    } catch {}
  };

  const handleAttachNoteImage = (itemId) => {
    setMenuOpen(false);
    setPickerOpen(false);
    setNoteImagePickerItemId(itemId);
  };

  const handlePickNoteImage = async (fileId) => {
    if (!noteImagePickerItemId) return;
    try {
      const { data } = await api.patch(`/api/pinboards/${boardId}/items/${noteImagePickerItemId}`, {
        noteImageFileId: String(fileId),
      });
      setItems(prev => prev.map(i => i.id === noteImagePickerItemId ? data.item : i));
    } catch {}
    setNoteImagePickerItemId(null);
  };

  const handleRemoveNoteImage = async (itemId) => {
    try {
      const { data } = await api.patch(`/api/pinboards/${boardId}/items/${itemId}`, {
        noteImageFileId: null,
      });
      setItems(prev => prev.map(i => i.id === itemId ? data.item : i));
    } catch {}
  };

  const handleConnectSelect = async (itemId) => {
    if (!connectMode) return;
    if (!connectFromItemId) {
      setConnectFromItemId(itemId);
      return;
    }
    if (connectFromItemId === itemId) {
      setConnectFromItemId(null);
      return;
    }
    try {
      const { data } = await api.post(`/api/pinboards/${boardId}/links`, {
        fromItemId: connectFromItemId,
        toItemId: itemId,
      });
      if (data?.link) {
        setLinks(prev => prev.some(l => l.id === data.link.id) ? prev : [...prev, data.link]);
      }
    } catch {}
    setConnectFromItemId(null);
  };

  const handleDeleteLink = async (linkId) => {
    try {
      await api.delete(`/api/pinboards/${boardId}/links/${linkId}`);
      setLinks(prev => prev.filter(l => l.id !== linkId));
    } catch {}
  };

  const linkMotionMode = links.length > 120 ? 'reduced' : 'full';

  const setMiniViewportTopLeft = useCallback((left, top) => {
    const el = canvasRef.current;
    if (!el) return;
    const totalW = BOARD_WIDTH * zoomRef.current;
    const totalH = BOARD_HEIGHT * zoomRef.current;
    const maxLeft = Math.max(0, 1 - miniViewport.width);
    const maxTop = Math.max(0, 1 - miniViewport.height);
    const clampedLeft = Math.max(0, Math.min(maxLeft, left));
    const clampedTop = Math.max(0, Math.min(maxTop, top));
    el.scrollLeft = clampedLeft * totalW;
    el.scrollTop = clampedTop * totalH;
  }, [miniViewport.width, miniViewport.height]);

  const jumpMiniToPoint = useCallback((nx, ny) => {
    setMiniViewportTopLeft(nx - miniViewport.width / 2, ny - miniViewport.height / 2);
  }, [miniViewport.width, miniViewport.height, setMiniViewportTopLeft]);

  if (loading) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>Loading...</div>;
  if (!board) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>Board not found</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 40px)', position: 'relative' }}>
      <motion.div
        className="topbar"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        style={{ flexShrink: 0 }}
      >
        <button className="btn btn-ghost btn-sm" onClick={onBack}>
          <ArrowLeft size={14} /> Back</button>
        <h1 style={{ marginLeft: 12, fontSize: '1.1rem', color: board.creatorColor || 'var(--text-primary)' }}>
          {board.name}
        </h1>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button className="btn btn-ghost btn-sm" onClick={zoomOut} title="Zoom out">-</button>
            <button className="btn btn-ghost btn-sm" onClick={zoomReset} title="Reset zoom">{Math.round(zoom * 100)}%</button>
            <button className="btn btn-ghost btn-sm" onClick={zoomIn} title="Zoom in">+</button>
            <button className="btn btn-ghost btn-sm" onClick={zoomFit} title="Fit to screen">Fit</button>
            <button
              className={`btn btn-sm ${connectMode ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => {
                setConnectMode(v => !v);
                setConnectFromItemId(null);
              }}
              title="Card link mode"
            >
              {connectMode ? <Unlink size={14} /> : <Link2 size={14} />} {connectMode ? 'Linking on' : 'Link'}
            </button>
          </div>
          <div style={{ position: 'relative' }}>
          <button className="btn btn-primary btn-sm" onClick={() => setMenuOpen(o => !o)}>
            <Plus size={14} /> Add card</button>
          {menuOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 4px)', right: 0,
              background: 'var(--bg-secondary)', border: '1px solid var(--border)',
              borderRadius: 8, padding: 4, minWidth: 180, zIndex: 100,
              boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            }}>
              <button className="btn btn-ghost btn-sm" onClick={addNote} style={{ width: '100%', justifyContent: 'flex-start' }}>
                <StickyNote size={14} /> Note</button>
              <button className="btn btn-ghost btn-sm" onClick={pickFile} style={{ width: '100%', justifyContent: 'flex-start' }}>
                <Upload size={14} /> Upload image/video</button>
              <button className="btn btn-ghost btn-sm" onClick={() => { setMenuOpen(false); setPickerOpen(true); }} style={{ width: '100%', justifyContent: 'flex-start' }}>
                <Link2 size={14} /> From existing file
              </button>
            </div>
          )}
          </div>
        </div>
      </motion.div>

      <input ref={fileInputRef} type="file" accept="image/*,video/*" onChange={uploadFile} style={{ display: 'none' }} />

      <div
        ref={canvasRef}
        onMouseDown={startBackgroundPan}
        onClick={() => {
          if (!connectMode) return;
          setConnectFromItemId(null);
        }}
        style={{
          flex: 1, minHeight: 0,
          position: 'relative',
          background: 'var(--bg-primary)',
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          border: '1px solid var(--border)',
          borderRadius: 12,
          overflow: 'auto',
          touchAction: 'none',
          overscrollBehavior: 'contain',
          cursor: 'grab',
        }}
      >
        <div style={{ position: 'relative', width: BOARD_WIDTH * zoom, height: BOARD_HEIGHT * zoom }}>
          <svg
            width={BOARD_WIDTH * zoom}
            height={BOARD_HEIGHT * zoom}
            style={{ position: 'absolute', inset: 0, pointerEvents: connectMode ? 'auto' : 'none', zIndex: 1 }}
          >
            <defs>
              <marker
                id={`pin-arrow-${boardId}`}
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0,0 L8,4 L0,8 z" fill="rgba(148,163,184,0.9)" />
              </marker>
            </defs>
            {links.map(link => {
              const from = items.find(i => i.id === link.fromItemId);
              const to = items.find(i => i.id === link.toItemId);
              if (!from || !to) return null;
              const x1 = (from.x + from.width / 2) * zoom;
              const y1 = (from.y + from.height / 2) * zoom;
              const x2 = (to.x + to.width / 2) * zoom;
              const y2 = (to.y + to.height / 2) * zoom;
              const dx = x2 - x1;
              const dy = y2 - y1;
              const len = Math.max(1, Math.hypot(dx, dy));
              const nx = -dy / len;
              const ny = dx / len;
              const bend = Math.min(180, Math.max(40, len * 0.22));
              const cx = (x1 + x2) / 2 + nx * bend;
              const cy = (y1 + y2) / 2 + ny * bend;
              const t = 0.58;
              const mx = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * cx + t * t * x2;
              const my = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * cy + t * t * y2;
              const speed = 3.1 + (link.id % 5) * 0.33;
              const delay = -((link.id % 9) * 0.27);
              return (
                <g
                  key={link.id}
                  className={`pinboard-link-group pinboard-link-group--${linkMotionMode}`}
                  style={{ animationDelay: `${delay}s` }}
                >
                  <path
                    d={`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`}
                    className="pinboard-link-rope"
                    stroke="rgba(148,163,184,0.75)"
                    strokeWidth="2"
                    fill="none"
                    style={{
                      animationDuration: `${speed}s`,
                      animationDelay: `${delay}s`,
                    }}
                    markerEnd={`url(#pin-arrow-${boardId})`}
                  />
                  {connectMode && (
                    <circle
                      cx={mx}
                      cy={my}
                      r="8"
                      fill="rgba(239,68,68,0.9)"
                      style={{ cursor: 'pointer' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteLink(link.id);
                      }}
                    />
                  )}
                </g>
              );
            })}
          </svg>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              width: BOARD_WIDTH,
              height: BOARD_HEIGHT,
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
              zIndex: 2,
            }}
          >
            {items.map(item => (
              <PinboardCard
                key={item.id}
                item={item}
                zoom={zoom}
                isPinching={isPinching}
                connectMode={connectMode}
                connectSelected={connectFromItemId === item.id}
                canEdit={!!user && item.authorId === user.id}
                canDelete={!!user && (item.authorId === user.id || board.userId === user.id)}
                boardId={boardId}
                onDrag={handleDrag}
                onResize={handleResize}
                onDelete={handleDelete}
                onVote={handleVote}
                onContentChange={handleContent}
                onAttachNoteImage={handleAttachNoteImage}
                onRemoveNoteImage={handleRemoveNoteImage}
                onConnectSelect={handleConnectSelect}
              />
            ))}
          </div>
        </div>
      </div>

      <div
        ref={miniMapRef}
        style={{
          position: 'absolute',
          right: 14,
          bottom: 14,
          width: 140,
          height: 102,
          borderRadius: 10,
          border: '1px solid var(--border)',
          background: 'rgba(2, 6, 23, 0.78)',
          backdropFilter: 'blur(6px)',
          zIndex: 20,
          overflow: 'hidden',
        }}
      >
        <div
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const nx = (e.clientX - rect.left) / rect.width;
            const ny = (e.clientY - rect.top) / rect.height;
            jumpMiniToPoint(nx, ny);
          }}
          style={{ position: 'relative', width: '100%', height: '100%', cursor: 'pointer' }}
        >
          {items.slice(0, 600).map(it => (
            <div
              key={`mini-${it.id}`}
              style={{
                position: 'absolute',
                left: `${(it.x / BOARD_WIDTH) * 100}%`,
                top: `${(it.y / BOARD_HEIGHT) * 100}%`,
                width: 4,
                height: 4,
                borderRadius: '50%',
                background: 'rgba(125,211,252,0.85)',
                transform: 'translate(-50%, -50%)',
              }}
            />
          ))}
          <div
            onPointerDown={(e) => {
              e.stopPropagation();
              if (!miniMapRef.current) return;
              miniDragRef.current = {
                pointerId: e.pointerId,
                startX: e.clientX,
                startY: e.clientY,
                startLeft: miniViewport.left,
                startTop: miniViewport.top,
              };
              e.currentTarget.setPointerCapture?.(e.pointerId);
            }}
            onPointerMove={(e) => {
              const d = miniDragRef.current;
              if (!d || d.pointerId !== e.pointerId || !miniMapRef.current) return;
              const rect = miniMapRef.current.getBoundingClientRect();
              const dx = (e.clientX - d.startX) / Math.max(1, rect.width);
              const dy = (e.clientY - d.startY) / Math.max(1, rect.height);
              setMiniViewportTopLeft(d.startLeft + dx, d.startTop + dy);
            }}
            onPointerUp={(e) => {
              if (miniDragRef.current?.pointerId === e.pointerId) miniDragRef.current = null;
            }}
            onPointerCancel={(e) => {
              if (miniDragRef.current?.pointerId === e.pointerId) miniDragRef.current = null;
            }}
            style={{
              position: 'absolute',
              left: `${miniViewport.left * 100}%`,
              top: `${miniViewport.top * 100}%`,
              width: `${miniViewport.width * 100}%`,
              height: `${miniViewport.height * 100}%`,
              border: '1px solid rgba(250,204,21,0.95)',
              background: 'rgba(250,204,21,0.12)',
              boxShadow: '0 0 0 1px rgba(250,204,21,0.35) inset',
              cursor: 'grab',
            }}
          />
        </div>
      </div>

      {pickerOpen && (
        <FilePickerModal
          onClose={() => setPickerOpen(false)}
          onPick={addFileRef}
        />
      )}

      {noteImagePickerItemId && (
        <FilePickerModal
          onClose={() => setNoteImagePickerItemId(null)}
          onPick={handlePickNoteImage}
        />
      )}
    </div>
  );
}
