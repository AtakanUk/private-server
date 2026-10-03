import React, { useCallback, useEffect, useRef, useState } from 'react';

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;

function clampPan(panX, panY, zoom, imageEl) {
  if (!imageEl || zoom <= 1) return { x: 0, y: 0 };
  const maxX = (imageEl.offsetWidth * (zoom - 1)) / 2;
  const maxY = (imageEl.offsetHeight * (zoom - 1)) / 2;
  return {
    x: Math.max(-maxX, Math.min(maxX, panX)),
    y: Math.max(-maxY, Math.min(maxY, panY)),
  };
}

function ImageViewer({ imageSrc, alt = '', onClose }) {
  const containerRef = useRef(null);
  const contentRef = useRef(null);
  const imageRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const [displayZoom, setDisplayZoom] = useState(100);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const g = useRef({
    zoom: 1,
    panX: 0,
    panY: 0,
    isDragging: false,
    activePointerId: null,
    dragBaseX: 0,
    dragBaseY: 0,
    isTouchPanning: false,
    tStartX: 0,
    tStartY: 0,
    tBasePanX: 0,
    tBasePanY: 0,
    pinchStartDist: 0,
    pinchStartZoom: 1,
    pinchStartPanX: 0,
    pinchStartPanY: 0,
    pinchStartMidX: 0,
    pinchStartMidY: 0,
    contentCenterX: 0,
    contentCenterY: 0,
    rafId: null,
  });

  const applyTransform = useCallback(() => {
    if (!imageRef.current) return;
    const { panX, panY, zoom, isDragging } = g.current;
    imageRef.current.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${zoom})`;
    imageRef.current.style.cursor = zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default';
  }, []);

  const scheduleFrame = useCallback(() => {
    if (g.current.rafId !== null) return;
    g.current.rafId = requestAnimationFrame(() => {
      g.current.rafId = null;
      applyTransform();
    });
  }, [applyTransform]);

  const commitZoom = useCallback((newZoom, pivotX, pivotY) => {
    const state = g.current;
    const oldZoom = state.zoom;
    const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));

    if (clamped <= MIN_ZOOM) {
      state.zoom = MIN_ZOOM;
      state.panX = 0;
      state.panY = 0;
    } else {
      const ratio = clamped / oldZoom;
      const nx = (pivotX ?? 0) * (1 - ratio) + state.panX * ratio;
      const ny = (pivotY ?? 0) * (1 - ratio) + state.panY * ratio;
      state.zoom = clamped;
      const constrained = clampPan(nx, ny, clamped, imageRef.current);
      state.panX = constrained.x;
      state.panY = constrained.y;
    }

    scheduleFrame();
    setDisplayZoom(Math.round(clamped * 100));
  }, [scheduleFrame]);

  const reset = useCallback(() => {
    g.current.zoom = 1;
    g.current.panX = 0;
    g.current.panY = 0;
    applyTransform();
    setDisplayZoom(100);
  }, [applyTransform]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const onWheel = (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.15 : -0.15;
      const r = el.getBoundingClientRect();
      commitZoom(
        g.current.zoom + delta,
        e.clientX - (r.left + r.width / 2),
        e.clientY - (r.top + r.height / 2)
      );
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [commitZoom]);

  const handlePointerDown = useCallback((e) => {
    if (g.current.pinchStartDist > 0) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (g.current.zoom <= 1) return;

    g.current.isDragging = true;
    g.current.activePointerId = e.pointerId;
    g.current.dragBaseX = e.clientX - g.current.panX;
    g.current.dragBaseY = e.clientY - g.current.panY;

    if (e.currentTarget?.setPointerCapture) {
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    e.preventDefault();
    applyTransform();
  }, [applyTransform]);

  const handlePointerMove = useCallback((e) => {
    if (!g.current.isDragging) return;
    if (g.current.activePointerId !== e.pointerId) return;

    const constrained = clampPan(
      e.clientX - g.current.dragBaseX,
      e.clientY - g.current.dragBaseY,
      g.current.zoom,
      imageRef.current
    );
    g.current.panX = constrained.x;
    g.current.panY = constrained.y;
    scheduleFrame();
    e.preventDefault();
  }, [scheduleFrame]);

  const handlePointerUp = useCallback((e) => {
    if (g.current.activePointerId !== e.pointerId) return;
    g.current.isDragging = false;
    g.current.activePointerId = null;
    applyTransform();
  }, [applyTransform]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const onStart = (e) => {
      const t = e.touches;
      if (t.length === 2) {
        const r = el.getBoundingClientRect();
        g.current.contentCenterX = r.left + r.width / 2;
        g.current.contentCenterY = r.top + r.height / 2;
        g.current.pinchStartDist = Math.hypot(
          t[0].clientX - t[1].clientX,
          t[0].clientY - t[1].clientY
        );
        g.current.pinchStartZoom = g.current.zoom;
        g.current.pinchStartPanX = g.current.panX;
        g.current.pinchStartPanY = g.current.panY;
        g.current.pinchStartMidX = (t[0].clientX + t[1].clientX) / 2;
        g.current.pinchStartMidY = (t[0].clientY + t[1].clientY) / 2;
        g.current.isTouchPanning = false;
      }
    };

    const onMove = (e) => {
      const t = e.touches;

      if (t.length === 2 && g.current.pinchStartDist > 0) {
        e.preventDefault();
        const d = Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
        const ratio = d / g.current.pinchStartDist;
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, g.current.pinchStartZoom * ratio));
        const midX = (t[0].clientX + t[1].clientX) / 2;
        const midY = (t[0].clientY + t[1].clientY) / 2;

        const pivotX = g.current.pinchStartMidX - g.current.contentCenterX;
        const pivotY = g.current.pinchStartMidY - g.current.contentCenterY;
        const zoomRatio = newZoom / g.current.pinchStartZoom;

        let nextX = pivotX * (1 - zoomRatio) + g.current.pinchStartPanX * zoomRatio + (midX - g.current.pinchStartMidX);
        let nextY = pivotY * (1 - zoomRatio) + g.current.pinchStartPanY * zoomRatio + (midY - g.current.pinchStartMidY);

        if (newZoom <= MIN_ZOOM) {
          nextX = 0;
          nextY = 0;
        } else {
          const constrained = clampPan(nextX, nextY, newZoom, imageRef.current);
          nextX = constrained.x;
          nextY = constrained.y;
        }

        g.current.zoom = newZoom;
        g.current.panX = nextX;
        g.current.panY = nextY;
        scheduleFrame();
      }
    };

    const onEnd = (e) => {
      const t = e.touches;
      if (t.length === 0) {
        g.current.isTouchPanning = false;
        g.current.pinchStartDist = 0;
        setDisplayZoom(Math.round(g.current.zoom * 100));
        applyTransform();
      } else if (t.length === 1) {
        g.current.pinchStartDist = 0;
      }
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
    };
  }, [scheduleFrame, applyTransform]);

  useEffect(() => {
    const onKey = (e) => {
      switch (e.key) {
        case 'Escape':
          onCloseRef.current?.();
          break;
        case '+':
        case '=':
          e.preventDefault();
          commitZoom(g.current.zoom + 0.25);
          break;
        case '-':
          e.preventDefault();
          commitZoom(g.current.zoom - 0.25);
          break;
        case '0':
          e.preventDefault();
          reset();
          break;
        case 'ArrowLeft': {
          e.preventDefault();
          const constrained = clampPan(g.current.panX - 20, g.current.panY, g.current.zoom, imageRef.current);
          g.current.panX = constrained.x;
          scheduleFrame();
          break;
        }
        case 'ArrowRight': {
          e.preventDefault();
          const constrained = clampPan(g.current.panX + 20, g.current.panY, g.current.zoom, imageRef.current);
          g.current.panX = constrained.x;
          scheduleFrame();
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          const constrained = clampPan(g.current.panX, g.current.panY - 20, g.current.zoom, imageRef.current);
          g.current.panY = constrained.y;
          scheduleFrame();
          break;
        }
        case 'ArrowDown': {
          e.preventDefault();
          const constrained = clampPan(g.current.panX, g.current.panY + 20, g.current.zoom, imageRef.current);
          g.current.panY = constrained.y;
          scheduleFrame();
          break;
        }
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [commitZoom, reset, scheduleFrame]);

  useEffect(() => {
    const state = g.current;
    return () => {
      if (state.rafId !== null) cancelAnimationFrame(state.rafId);
    };
  }, []);

  const handleDoubleClick = useCallback((e) => {
    if (g.current.zoom > 1) {
      reset();
      return;
    }

    const r = contentRef.current?.getBoundingClientRect();
    if (!r) return;
    commitZoom(2.5, e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
  }, [reset, commitZoom]);

  const handleImageLoad = useCallback(() => {
    g.current.panX = 0;
    g.current.panY = 0;
    g.current.zoom = 1;
    setDisplayZoom(100);
    applyTransform();
  }, [applyTransform]);

  return (
    <div className="image-viewer-container" ref={containerRef}>
      <div className="image-viewer-toolbar">
        <div className="image-viewer-controls">
          <button className="image-viewer-btn" onClick={() => commitZoom(g.current.zoom - 0.25)} title="Zoom out (-)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
              <path d="M8 11h6" />
            </svg>
          </button>
          <span className="image-viewer-zoom-level">{displayZoom}%</span>
          <button className="image-viewer-btn" onClick={() => commitZoom(g.current.zoom + 0.25)} title="Zoom in (+)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
              <path d="M11 8v6M8 11h6" />
            </svg>
          </button>
          <button className="image-viewer-btn" onClick={reset} title="Reset (0)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2-8.83" />
            </svg>
          </button>
          {onClose ? (
            <button className="image-viewer-btn image-viewer-close" onClick={onClose} title="Close (Esc)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          ) : null}
        </div>
      </div>

      <div className="image-viewer-content" ref={contentRef}>
        <img
          ref={imageRef}
          src={imageSrc}
          alt={alt}
          className="image-viewer-img"
          draggable={false}
          decoding="async"
          fetchPriority="high"
          onLoad={handleImageLoad}
          onDoubleClick={handleDoubleClick}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onLostPointerCapture={handlePointerUp}
        />
      </div>

      <div className="image-viewer-help">
        <small>Double-click/tap: zoom | Drag: pan | Pinch: zoom | +/- | ESC: close</small>
      </div>
    </div>
  );
}

export default ImageViewer;
