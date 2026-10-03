require('dotenv').config();

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { execFile } = require('child_process');
const db = require('../src/db');

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const args = new Set(process.argv.slice(2));
const shouldReprocessVideos = args.size === 0 || args.has('--videos') || args.has('--all');
const shouldReprocessThumbs = args.size === 0 || args.has('--thumbs') || args.has('--all');
const forceThumbs = args.has('--force-thumbs');
const forceVideos = args.has('--force-videos');

function extractVideoFrame(videoPath, outputPath) {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', [
      '-i', videoPath,
      '-ss', '1',
      '-vframes', '1',
      '-vf', 'scale=400:400:force_original_aspect_ratio=decrease',
      '-y',
      outputPath
    ], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function extractImageFrameWithFfmpeg(imagePath, outputPath) {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', [
      '-i', imagePath,
      '-vf', 'scale=400:400:force_original_aspect_ratio=decrease',
      '-frames:v', '1',
      '-y',
      outputPath
    ], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function generateImageThumbnail(filePath, thumbPath) {
  try {
    await sharp(filePath, {
      failOn: 'none',
      limitInputPixels: false,
      sequentialRead: true,
    })
      .rotate()
      .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 75 })
      .toFile(thumbPath);
    return true;
  } catch (primaryError) {
    try {
      const buffer = await sharp(filePath, {
        failOn: 'none',
        limitInputPixels: false,
        sequentialRead: true,
      })
        .rotate()
        .jpeg({ quality: 88 })
        .toBuffer();

      await sharp(buffer, { failOn: 'none', limitInputPixels: false })
        .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 75 })
        .toFile(thumbPath);
      return true;
    } catch (secondaryError) {
      try {
        await extractImageFrameWithFfmpeg(filePath, thumbPath);
        return true;
      } catch {
        console.error('[thumb:image] failed:', {
          filePath,
          primaryError: primaryError?.message,
          secondaryError: secondaryError?.message,
        });
        return false;
      }
    }
  }
}

function extractVideoMetadata(filePath) {
  return new Promise((resolve) => {
    execFile('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_name,width,height,bit_rate',
      '-show_entries', 'format=duration,bit_rate',
      '-of', 'default=noprint_wrappers=1:nokey=0',
      filePath
    ], (err, stdout) => {
      if (err || !stdout) {
        resolve(null);
        return;
      }

      const metadata = {};
      stdout.trim().split('\n').forEach((line) => {
        const [key, value] = line.split('=');
        if (key && value) metadata[key] = value;
      });

      resolve({
        duration: parseFloat(metadata.duration) || null,
        bitrate: parseInt(metadata.bit_rate, 10) || null,
        codec: metadata.codec_name || null,
        width: parseInt(metadata.width, 10) || null,
        height: parseInt(metadata.height, 10) || null,
      });
    });
  });
}

async function generateThumbnail(filePath, fileId, mimetype) {
  const thumbDir = path.join(UPLOAD_DIR, 'thumbnails');
  fs.mkdirSync(thumbDir, { recursive: true });
  const thumbPath = path.join(thumbDir, `${fileId}.webp`);

  try {
    if (mimetype.startsWith('image/') && mimetype !== 'image/svg+xml') {
      const ok = await generateImageThumbnail(filePath, thumbPath);
      if (!ok) return null;
      return `${fileId}.webp`;
    }

    if (mimetype.startsWith('video/')) {
      const tmpFrame = path.join(thumbDir, `${fileId}_frame.jpg`);
      await extractVideoFrame(filePath, tmpFrame);
      await sharp(tmpFrame)
        .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 75 })
        .toFile(thumbPath);
      fs.unlinkSync(tmpFrame);
      return `${fileId}.webp`;
    }
  } catch (error) {
    console.error(`Thumbnail failed for ${fileId}: ${error.message}`);
  }

  return null;
}

async function processVideoProxies(fileId, filePath) {
  const metadata = await extractVideoMetadata(filePath);
  if (!metadata?.bitrate || !metadata?.duration) {
    db.prepare('UPDATE files SET proxy_status = ? WHERE id = ?').run('failed', fileId);
    return false;
  }

  db.prepare('UPDATE files SET duration = ?, bitrate = ?, width = ?, height = ?, codec = ?, proxy_status = ?, proxy_variants = ? WHERE id = ?')
    .run(metadata.duration, metadata.bitrate, metadata.width, metadata.height, metadata.codec, 'processing', null, fileId);

  const proxiesDir = path.join(UPLOAD_DIR, 'proxies');
  fs.mkdirSync(proxiesDir, { recursive: true });

  const qualities = [
    { name: '1080p', bitrate: '8000k', maxDim: 1920 },
    { name: '720p', bitrate: '4000k', maxDim: 1280 },
    { name: '360p', bitrate: '1000k', maxDim: 640 },
  ];

  const variants = {};
  let hasAnyProxy = false;

  for (const quality of qualities) {
    const proxyPath = path.join(proxiesDir, `${fileId}_${quality.name}.mp4`);
    const bitrateKbps = parseInt(quality.bitrate, 10);

    try {
      await new Promise((resolve, reject) => {
        execFile('ffmpeg', [
          '-i', filePath,
          '-c:v', 'libx264',
          '-b:v', quality.bitrate,
          '-maxrate', `${Math.round(bitrateKbps * 1.5)}k`,
          '-bufsize', `${bitrateKbps * 2}k`,
          '-vf', `scale=${quality.maxDim}:${quality.maxDim}:force_original_aspect_ratio=decrease`,
          '-movflags', '+faststart',
          '-preset', 'medium',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-y',
          proxyPath
        ], { maxBuffer: 1024 * 1024 * 10 }, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      variants[quality.name] = `${fileId}_${quality.name}.mp4`;
      hasAnyProxy = true;
      db.prepare('UPDATE files SET proxy_status = ?, proxy_variants = ? WHERE id = ?')
        .run('processing', JSON.stringify(variants), fileId);
      console.log(`Generated ${quality.name} proxy for ${fileId}`);
    } catch (error) {
      console.error(`Proxy failed for ${fileId} ${quality.name}: ${error.message}`);
    }
  }

  db.prepare('UPDATE files SET proxy_status = ?, proxy_variants = ? WHERE id = ?')
    .run(hasAnyProxy ? 'completed' : 'failed', hasAnyProxy ? JSON.stringify(variants) : null, fileId);

  return hasAnyProxy;
}

async function reprocessThumbnails() {
  const rows = db.prepare('SELECT id, filename, mime_type, category, thumbnail FROM files WHERE category IN (\'image\', \'video\')').all();
  let processed = 0;

  for (const row of rows) {
    const originalPath = path.join(UPLOAD_DIR, 'originals', row.filename);
    const thumbPath = row.thumbnail ? path.join(UPLOAD_DIR, 'thumbnails', row.thumbnail) : null;
    const needsThumb = forceThumbs || !row.thumbnail || !thumbPath || !fs.existsSync(thumbPath);

    if (!needsThumb || !fs.existsSync(originalPath)) continue;

    const generated = await generateThumbnail(originalPath, row.id, row.mime_type);
    if (generated) {
      db.prepare('UPDATE files SET thumbnail = ?, thumbnail_updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(generated, row.id);
      processed += 1;
    }
  }

  console.log(`Thumbnail reprocess complete: ${processed} files updated`);
}

async function reprocessVideos() {
  const query = forceVideos
    ? 'SELECT id, filename FROM files WHERE category = \'video\''
    : 'SELECT id, filename FROM files WHERE category = \'video\' AND (proxy_status IS NULL OR proxy_status IN (\'pending\', \'failed\'))';
  const rows = db.prepare(query).all();
  let processed = 0;

  for (const row of rows) {
    const originalPath = path.join(UPLOAD_DIR, 'originals', row.filename);
    if (!fs.existsSync(originalPath)) continue;

    const ok = await processVideoProxies(row.id, originalPath);
    if (ok) processed += 1;
  }

  console.log(`Video reprocess complete: ${processed}/${rows.length} videos updated`);
}

(async () => {
  console.log('Starting media reprocess...');
  if (shouldReprocessThumbs) await reprocessThumbnails();
  if (shouldReprocessVideos) await reprocessVideos();
  console.log('Media reprocess finished');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});