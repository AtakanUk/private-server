const fs = require('fs');
const path = require('path');
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');

const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, '..', 'logs');
const MAX_TOTAL_BYTES = Number(process.env.LOG_MAX_TOTAL_BYTES || 500 * 1024 * 1024); // 500 MB
const RETENTION_DAYS = process.env.LOG_RETENTION_DAYS || '30d';
const MAX_FILE_SIZE = process.env.LOG_MAX_FILE_SIZE || '50m';

fs.mkdirSync(LOG_DIR, { recursive: true });

const jsonlFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.printf((info) => {
    const { timestamp, level, message, ...rest } = info;
    return JSON.stringify({ ts: timestamp, level, message, ...rest });
  })
);

const accessTransport = new DailyRotateFile({
  dirname: LOG_DIR,
  filename: 'access-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: MAX_FILE_SIZE,
  maxFiles: RETENTION_DAYS,
  zippedArchive: true,
  level: 'info',
});

const errorTransport = new DailyRotateFile({
  dirname: LOG_DIR,
  filename: 'error-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: MAX_FILE_SIZE,
  maxFiles: RETENTION_DAYS,
  zippedArchive: true,
  level: 'warn',
});

const accessLogger = winston.createLogger({
  level: 'info',
  format: jsonlFormat,
  transports: [
    accessTransport,
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'HH:mm:ss' }),
        winston.format.printf((info) => {
          const { timestamp, level, message, method, url, status, duration, username } = info;
          if (method) {
            return `${timestamp} ${level}: ${method} ${url} ${status || '-'} ${duration ? duration + 'ms' : ''} ${username ? `[${username}]` : '[guest]'}`;
          }
          return `${timestamp} ${level}: ${message}`;
        })
      ),
    }),
  ],
});

const errorLogger = winston.createLogger({
  level: 'warn',
  format: jsonlFormat,
  transports: [errorTransport],
});

function dirSize(dir) {
  let total = 0;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      try {
        total += fs.statSync(path.join(dir, entry.name)).size;
      } catch {}
    }
  } catch {}
  return total;
}

function enforceTotalSizeLimit() {
  try {
    const total = dirSize(LOG_DIR);
    if (total <= MAX_TOTAL_BYTES) return;

    const files = fs.readdirSync(LOG_DIR)
      .filter((f) => /^(access|error)-\d{4}-\d{2}-\d{2}/.test(f))
      .map((f) => {
        const full = path.join(LOG_DIR, f);
        try {
          const stat = fs.statSync(full);
          return { name: f, full, mtime: stat.mtimeMs, size: stat.size };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => a.mtime - b.mtime);

    let current = total;
    for (const f of files) {
      if (current <= MAX_TOTAL_BYTES) break;
      try {
        fs.unlinkSync(f.full);
        current -= f.size;
        accessLogger.info({ message: 'log_rotated_oversize', deletedFile: f.name, deletedSize: f.size });
      } catch {}
    }
  } catch (err) {
    console.error('Log size enforcement failed:', err.message);
  }
}

setInterval(enforceTotalSizeLimit, 60 * 60 * 1000);
setTimeout(enforceTotalSizeLimit, 30 * 1000);

function listLogDates() {
  try {
    const files = fs.readdirSync(LOG_DIR);
    const dates = new Set();
    for (const f of files) {
      const m = f.match(/^access-(\d{4}-\d{2}-\d{2})/);
      if (m) dates.add(m[1]);
    }
    return Array.from(dates).sort().reverse();
  } catch {
    return [];
  }
}

function readLogFile(date) {
  const candidates = [
    path.join(LOG_DIR, `access-${date}.log`),
    path.join(LOG_DIR, `access-${date}.log.gz`),
  ];

  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    try {
      let raw;
      if (file.endsWith('.gz')) {
        const zlib = require('zlib');
        raw = zlib.gunzipSync(fs.readFileSync(file)).toString('utf8');
      } else {
        raw = fs.readFileSync(file, 'utf8');
      }
      const lines = raw.split('\n').filter(Boolean);
      const records = [];
      for (const line of lines) {
        try {
          records.push(JSON.parse(line));
        } catch {}
      }
      return records;
    } catch (err) {
      console.error(`Failed reading ${file}:`, err.message);
    }
  }
  return [];
}

module.exports = {
  accessLogger,
  errorLogger,
  listLogDates,
  readLogFile,
  LOG_DIR,
};
