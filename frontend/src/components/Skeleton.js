import React from 'react';

export function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div className="skeleton skeleton-thumb" />
      <div className="skeleton-info">
        <div className="skeleton skeleton-line skeleton-line-full" />
        <div className="skeleton skeleton-line skeleton-line-short" />
      </div>
    </div>
  );
}

export function SkeletonGrid({ count = 12 }) {
  return (
    <div className="file-grid">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
