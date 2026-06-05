import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Nav from '../components/Nav';
import { apiUrl } from '../lib/api';

export default function View() {
  const { token } = useParams();
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    let alive = true;
    fetch(apiUrl(`/api/view/${token}`))
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!alive) return;
        if (r.ok) {
          setState({ status: 'ok', data: body });
          const key = `viewed_${token}`;
          if (!sessionStorage.getItem(key)) {
            sessionStorage.setItem(key, '1');
            fetch(apiUrl(`/api/view/${token}/hit`), { method: 'POST' }).catch(() => {});
          }
        }
        else if (r.status === 403) setState({ status: 'revoked' });
        else setState({ status: 'notfound' });
      })
      .catch(() => alive && setState({ status: 'notfound' }));
    return () => {
      alive = false;
    };
  }, [token]);

  const stage = {
    position: 'fixed',
    top: 80,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    background: '#faf9f7',
  };

  return (
    <div style={{ height: '100vh', overflow: 'hidden', background: '#faf9f7' }}>
      <Nav />
      <main style={stage}>
        {state.status === 'loading' && (
          <p className="font-label text-stone-400 uppercase tracking-[0.15em] text-sm">Loading…</p>
        )}

        {(state.status === 'revoked' || state.status === 'notfound') && (
          <div style={{ textAlign: 'center', maxWidth: 460 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: '#f4f3f1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 20px',
                fontSize: 24,
              }}
            >
              🔒
            </div>
            <h1 className="font-headline text-2xl font-semibold text-stone-900">
              {state.status === 'revoked' ? 'Access revoked' : 'Link not found'}
            </h1>
            <p className="mt-2 text-stone-500 text-[15px] leading-relaxed">
              {state.status === 'revoked'
                ? 'This demo link has been disabled by the owner. Contact DeciOps.ai for renewed access.'
                : 'This link is invalid or no longer exists.'}
            </p>
          </div>
        )}

        {state.status === 'ok' && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              maxWidth: '100%',
              maxHeight: '100%',
              gap: 20,
              alignItems: 'center',
              width: '100%',
            }}
          >
            <div
              style={{
                maxWidth: '100%',
                maxHeight: state.data.description ? '70%' : '100%',
                borderRadius: 16,
                overflow: 'hidden',
                boxShadow:
                  '0 20px 60px -15px rgba(26,28,27,0.35), 0 0 0 1px rgba(26,28,27,0.06)',
                background: '#000',
                display: 'flex',
              }}
            >
              <video
                style={{ maxWidth: '100%', maxHeight: '100%', display: 'block' }}
                controls
                autoPlay
                playsInline
                controlsList="nodownload noremoteplayback"
                disablePictureInPicture
                disableRemotePlayback
                onContextMenu={(e) => e.preventDefault()}
                src={apiUrl(`/api/stream/${token}`)}
              />
            </div>

            {state.data.title && (
              <div style={{ width: '100%', maxWidth: 900, textAlign: 'center' }}>
                <h1 className="font-headline text-xl font-semibold text-stone-900">
                  {state.data.title}
                </h1>
                {state.data.description && (
                  <p className="mt-1.5 text-stone-600 text-[15px] leading-relaxed whitespace-pre-wrap">
                    {state.data.description}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
