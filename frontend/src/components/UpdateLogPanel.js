import React from 'react';
import { Sparkles, Wrench } from 'lucide-react';
import updateLogEntries from '../constants/updateLogEntries';

function SectionList({ title, items, icon }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
        {icon}
        <span>{title}</span>
      </div>
      <ul style={{ margin: 0, paddingLeft: 16, display: 'grid', gap: 4 }}>
        {items.map((line, idx) => (
          <li key={`${title}-${idx}`} style={{ fontSize: '0.83rem', color: 'var(--text-primary)', lineHeight: 1.45 }}>
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function UpdateLogPanel() {
  const latest = updateLogEntries[0];
  const older = updateLogEntries.slice(1);

  if (!latest) return null;

  return (
    <div style={{
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '16px 20px',
      marginBottom: 16,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>Updates</h3>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{latest.date}</span>
      </div>

      <div style={{ marginTop: 8, fontSize: '0.9rem', fontWeight: 600 }}>{latest.title}</div>
      <div style={{ marginTop: 6, fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
        {latest.summary}
      </div>

      <SectionList
        title="New features"
        items={latest.features}
        icon={<Sparkles size={13} color="#06b6d4" />}
      />

      <SectionList
        title="Improvements"
        items={latest.fixes}
        icon={<Wrench size={13} color="#f59e0b" />}
      />

      {older.length > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
            Show earlier updates ({older.length})
          </summary>
          <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
            {older.map((entry) => (
              <div key={entry.id} style={{ borderTop: '1px dashed var(--border)', paddingTop: 8 }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{entry.date}</div>
                <div style={{ fontSize: '0.84rem', color: 'var(--text-primary)', fontWeight: 600 }}>{entry.title}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{entry.summary}</div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
