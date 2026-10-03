const updateLogEntries = [
  {
    id: '2026-04-14-thumbnail-and-controls-v1',
    date: '2026-04-14',
    title: 'Video cover picker and card controls',
    summary: 'Video cards and player controls are easier to use: pick any frame as a cover, and reach card buttons comfortably on mobile.',
    features: [
      'New "Use this frame as cover" action in the video player (mobile and desktop).',
      'Updated covers refresh instantly in every grid; stale cached thumbnails are bypassed.',
      'Cover images are versioned so album and file grids stay consistent.',
    ],
    fixes: [
      'The blur toggle is back in its original position.',
      'The "HD ready / preparing preview" badge no longer overlaps the card buttons.',
      'Hover-only actions are now always visible on touch devices.',
    ],
  },
  {
    id: '2026-04-14-pinboard-v2',
    date: '2026-04-14',
    title: 'Pinboards, major update',
    summary: 'Pinboards are much better for collecting ideas: finding, linking and illustrating cards is easier.',
    features: [
      'Note cards can include images.',
      'Cards can be linked to each other with animated connector lines.',
      'Vote results are shown on the card border: green for positive, red for negative, orange for mixed.',
      'A minimap in the corner lets you jump anywhere on large boards.',
      'Boards open focused on the area with the most cards instead of an empty spot.',
    ],
    fixes: [
      'Smoother navigation on large boards.',
      'Simpler selection flow in link mode; backing out of a wrong selection is easier.',
    ],
  },
  {
    id: '2026-04-14-media-viewer-v1',
    date: '2026-04-14',
    title: 'Better photo and video viewing',
    summary: 'Viewing media is more comfortable, especially on mobile: clearer controls and smoother navigation.',
    features: [
      'Clearer video quality picker (Auto, 1080p, 720p, 360p, Original).',
      'More consistent media viewer across mobile and desktop.',
    ],
    fixes: [
      'Smoother pinch-zoom and panning on photos.',
      'Fixed the post view opening at the wrong scroll position.',
    ],
  },
  {
    id: '2026-04-14-notifications-v1',
    date: '2026-04-14',
    title: 'Notification routing',
    summary: 'Clicking a notification now takes you straight to the related content.',
    features: [
      'Notifications open the related post directly.',
      'The notification popover stays on screen and opens in the right direction relative to the bell.',
    ],
    fixes: [
      'Fixed the popover opening at an unrelated position on desktop.',
    ],
  },
];

export default updateLogEntries;
