// User uploads are served from the app's own origin. The CSP sandbox makes the
// browser open an upload (an SVG with a script, or HTML uploaded under an image
// MIME type) in an opaque origin with scripts disabled, so it cannot read the
// session token. PDFs are exempt because browsers won't render them sandboxed.
function sandboxUserContent(res, mimeType) {
  if (mimeType === 'application/pdf') return;
  res.setHeader('Content-Security-Policy', 'sandbox');
}

// RFC 6266 header with an ASCII fallback plus the UTF-8 name, so downloads keep
// their real file name instead of a percent-encoded one.
function contentDisposition(type, filename) {
  const name = String(filename || 'file');
  const fallback = name.replace(/[^\x20-\x7e]|["\\]/g, '_');
  const encoded = encodeURIComponent(name)
    .replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

module.exports = { sandboxUserContent, contentDisposition };
