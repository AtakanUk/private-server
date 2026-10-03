export function parseProxyVariants(rawVariants) {
  if (!rawVariants) return {};
  if (typeof rawVariants === 'object') return rawVariants;
  try {
    return JSON.parse(rawVariants);
  } catch {
    return {};
  }
}

export function getAvailableVideoQualities(file) {
  const variants = parseProxyVariants(file?.proxy_variants);
  return ['1080p', '720p', '360p'].filter((quality) => Boolean(variants[quality]));
}

export function chooseAutoVideoQuality(file) {
  const available = getAvailableVideoQualities(file);
  if (!available.length) return 'original';

  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const downlink = Number(connection?.downlink || 0);
  const effectiveType = connection?.effectiveType || '';
  const saveData = Boolean(connection?.saveData);

  if (saveData || effectiveType.includes('2g') || (downlink > 0 && downlink < 2)) {
    return available.includes('360p') ? '360p' : available[available.length - 1];
  }

  if (effectiveType.includes('3g') || (downlink > 0 && downlink < 6)) {
    if (available.includes('720p')) return '720p';
    if (available.includes('360p')) return '360p';
    return available[0];
  }

  if (available.includes('1080p')) return '1080p';
  if (available.includes('720p')) return '720p';
  return available[0];
}

export function resolveRequestedVideoQuality(file, selectedQuality) {
  if (!file) return 'original';
  if (selectedQuality === 'auto') return chooseAutoVideoQuality(file);
  if (selectedQuality === 'original') return 'original';

  const available = getAvailableVideoQualities(file);
  if (available.includes(selectedQuality)) return selectedQuality;
  return chooseAutoVideoQuality(file);
}

export function getVideoQualityStatusText(file, selectedQuality, resolvedQuality) {
  const status = file?.proxy_status;
  const resolvedLabel = resolvedQuality === 'original' ? 'original' : resolvedQuality;

  if (status === 'processing' || status === 'pending') {
    if (resolvedQuality === 'original') return 'Preparing; playing the original for now';
    return `Preparing; using ${resolvedLabel} for now`;
  }

  if (status === 'failed') {
    return 'Processing failed; playing the original';
  }

  if (selectedQuality === 'auto') {
    return `Auto: ${resolvedLabel}`;
  }

  if (selectedQuality !== resolvedQuality) {
    return `${selectedQuality} is not ready; using ${resolvedLabel}`;
  }

  if (resolvedQuality === 'original') {
    return 'Original quality';
  }

  return `${resolvedLabel} ready`;
}

export function getFileProcessingBadge(file) {
  if (!file) return null;

  if (file.category === 'video') {
    if (file.proxy_status === 'processing' || file.proxy_status === 'pending') {
      return { label: 'Preparing', tone: 'processing' };
    }
    if (file.proxy_status === 'failed') {
      return { label: 'Processing failed', tone: 'failed' };
    }
    if (getAvailableVideoQualities(file).length > 0) {
      return { label: 'HD ready', tone: 'ready' };
    }
  }

  if (!file.thumbnail && (file.category === 'image' || file.category === 'video')) {
    return { label: 'Preparing preview', tone: 'processing' };
  }

  return null;
}