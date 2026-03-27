'use client';

import toast from 'react-hot-toast';

const baseStyle: React.CSSProperties = {
  background: 'var(--bg-card)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  fontSize: '13px',
  fontWeight: '600',
  borderRadius: '8px',
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '15px 25px',
  maxWidth: '360px',
};

function ToastContent({
  id,
  message,
  type,
}: {
  id: string;
  message: string;
  type: 'success' | 'error';
}) {
  return (
    <div style={baseStyle}>
      <span style={{ fontSize: '14px', lineHeight: 1 }}>
        {type === 'success' ? (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="8" fill="#4ade80" fillOpacity="0.2" />
            <path d="M4.5 8l2.5 2.5 4.5-5" stroke="#4ade80" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="8" fill="#f87171" fillOpacity="0.2" />
            <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#f87171" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        )}
      </span>
      <span style={{ flex: 1 }}>{message}</span>
      <button
        onClick={(e) => { e.stopPropagation(); toast.dismiss(id); }}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'rgba(255,255,255,0.4)',
          padding: '0 2px',
          fontSize: '16px',
          lineHeight: 1,
          display: 'flex',
          alignItems: 'center',
        }}
        onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.9)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}
      >
        ✕
      </button>
    </div>
  );
}

export function notifySuccess(message: string, duration = 5000) {
  toast.custom(
    (t) => <ToastContent id={t.id} message={message} type="success" />,
    { duration }
  );
}

export function notifyError(message: string, duration = 5000) {
  toast.custom(
    (t) => <ToastContent id={t.id} message={message} type="error" />,
    { duration }
  );
}
