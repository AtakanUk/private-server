const db = require('../db');

const URL_PATTERNS = [
  { re: /^\/api\/files\/(?:view|thumb|download)\/([^/?]+)/, type: 'file' },
  { re: /^\/api\/files\/(?!upload|bulk|stats|view|thumb|download)([^/?]+)/, type: 'file' },
  { re: /^\/api\/pinboards\/(\d+)\/items\/(\d+)/, type: 'pinboard_item', extra: 'pinboard' },
  { re: /^\/api\/pinboards\/(\d+)/, type: 'pinboard' },
  { re: /^\/api\/albums\/(\d+)/, type: 'album' },
  { re: /^\/api\/folders\/(\d+)/, type: 'folder' },
  { re: /^\/api\/admin\/users\/(\d+)/, type: 'user' },
];

const EVENT_FIELDS = {
  pinboard_opened: { field: 'boardId', type: 'pinboard' },
  file_opened: { field: 'fileId', type: 'file' },
  pinboard_item_clicked: { field: 'itemId', type: 'pinboard_item' },
};

function detectRefs(record) {
  const refs = [];

  if (record.event && EVENT_FIELDS[record.event]) {
    const cfg = EVENT_FIELDS[record.event];
    const id = record.details?.[cfg.field];
    if (id !== undefined && id !== null) refs.push({ type: cfg.type, id: String(id), primary: true });
  }

  const url = record.url || '';
  for (const p of URL_PATTERNS) {
    const m = url.match(p.re);
    if (!m) continue;
    if (p.type === 'pinboard_item') {
      refs.push({ type: 'pinboard_item', id: String(m[2]), primary: true });
    } else {
      refs.push({ type: p.type, id: String(m[1]), primary: true });
    }
    break;
  }

  return refs;
}

function truncate(s, n = 60) {
  if (!s) return s;
  const str = String(s).replace(/\s+/g, ' ').trim();
  return str.length > n ? str.slice(0, n) + '…' : str;
}

function batchSelect(table, columns, ids) {
  if (!ids || ids.size === 0) return new Map();
  const arr = Array.from(ids);
  const placeholders = arr.map(() => '?').join(',');
  const cols = ['id', ...columns].join(', ');
  const rows = db.prepare(`SELECT ${cols} FROM ${table} WHERE id IN (${placeholders})`).all(...arr);
  const map = new Map();
  for (const row of rows) map.set(String(row.id), row);
  return map;
}

function enrichLogRecords(records) {
  if (!Array.isArray(records) || records.length === 0) return records;

  const buckets = {
    file: new Set(),
    pinboard: new Set(),
    pinboard_item: new Set(),
    album: new Set(),
    folder: new Set(),
    user: new Set(),
  };

  const recordRefs = records.map((r) => {
    const refs = detectRefs(r);
    for (const ref of refs) {
      if (buckets[ref.type]) buckets[ref.type].add(ref.id);
    }
    return refs;
  });

  let lookups;
  try {
    lookups = {
      file: batchSelect('files', ['original_name'], buckets.file),
      pinboard: batchSelect('pinboards', ['name'], buckets.pinboard),
      pinboard_item: batchSelect('pinboard_items', ['kind', 'content', 'filename'], buckets.pinboard_item),
      album: batchSelect('albums', ['name'], buckets.album),
      folder: batchSelect('folders', ['name'], buckets.folder),
      user: batchSelect('users', ['username'], buckets.user),
    };
  } catch (err) {
    console.error('logEnricher batchSelect failed:', err.message);
    return records;
  }

  function labelFor(ref) {
    const row = lookups[ref.type]?.get(ref.id);
    if (!row) return '(deleted)';
    switch (ref.type) {
      case 'file': return truncate(row.original_name);
      case 'pinboard': return truncate(row.name);
      case 'pinboard_item': {
        if (row.kind === 'note') return truncate(row.content);
        return truncate(row.filename || row.content || '(image)');
      }
      case 'album': return truncate(row.name);
      case 'folder': return truncate(row.name);
      case 'user': return truncate(row.username);
      default: return null;
    }
  }

  for (let i = 0; i < records.length; i++) {
    const refs = recordRefs[i];
    if (!refs.length) continue;
    const primary = refs.find((r) => r.primary) || refs[0];
    const label = labelFor(primary);
    if (label) {
      records[i].entityType = primary.type;
      records[i].entityLabel = label;
    }
  }

  return records;
}

module.exports = { enrichLogRecords };
