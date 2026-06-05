import { useEffect, useState, useCallback } from 'react';
import { apiUrl } from '../lib/api';

const PW_KEY = 'deciops_admin_pw';

function api(path, pw, opts = {}) {
  return fetch(apiUrl(path), {
    ...opts,
    headers: { 'x-admin-password': pw, ...(opts.headers || {}) },
  });
}

export default function Admin() {
  const [pw, setPw] = useState(() => localStorage.getItem(PW_KEY) || '');
  const [authed, setAuthed] = useState(false);
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState('');

  // verify stored password on mount
  useEffect(() => {
    if (!pw) return;
    fetch(apiUrl('/api/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    }).then((r) => {
      if (r.ok) setAuthed(true);
      else {
        localStorage.removeItem(PW_KEY);
        setPw('');
      }
    });
  }, [pw]);

  async function login(e) {
    e.preventDefault();
    setPwError('');
    const r = await fetch(apiUrl('/api/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwInput }),
    });
    if (r.ok) {
      localStorage.setItem(PW_KEY, pwInput);
      setPw(pwInput);
      setAuthed(true);
    } else {
      setPwError('Invalid password');
    }
  }

  if (!authed) {
    return (
      <Shell>
        <div style={{ maxWidth: 380, margin: '12vh auto 0' }}>
          <h1 className="font-headline text-2xl font-semibold text-stone-900">Admin access</h1>
          <p className="mt-1 text-stone-500 text-sm">Enter the password to manage demo links.</p>
          <form onSubmit={login} className="mt-6 flex flex-col gap-3">
            <input
              type="password"
              value={pwInput}
              onChange={(e) => setPwInput(e.target.value)}
              placeholder="Password"
              autoFocus
              className="w-full rounded-lg border border-stone-300 px-4 py-3 text-[15px] outline-none focus:border-[#a5351e] focus:ring-1 focus:ring-[#a5351e]"
            />
            {pwError && <p className="text-sm text-red-600">{pwError}</p>}
            <button
              type="submit"
              className="rounded-lg bg-gradient-to-r from-[#a5351e] to-[#c74d34] px-4 py-3 font-label text-[14px] font-bold uppercase tracking-wide text-white hover:opacity-90"
            >
              Sign in
            </button>
          </form>
        </div>
      </Shell>
    );
  }

  return <Dashboard pw={pw} onLogout={() => { localStorage.removeItem(PW_KEY); setPw(''); setAuthed(false); }} />;
}

function Shell({ children }) {
  return (
    <div style={{ height: '100vh', overflowY: 'auto', background: '#faf9f7' }}>
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white">
        <div className="flex h-20 w-full items-center justify-between px-8">
          <img src="/deciops-logo.png" alt="DeciOps.ai" className="h-12 w-auto" />
          <span className="font-label text-[12px] font-semibold uppercase tracking-[0.15em] text-stone-400">
            Admin Portal
          </span>
        </div>
      </header>
      <div className="px-8 pb-20">{children}</div>
    </div>
  );
}

function Dashboard({ pw, onLogout }) {
  const [links, setLinks] = useState([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(null);

  const refresh = useCallback(() => {
    api('/api/links', pw)
      .then((r) => r.json())
      .then(setLinks)
      .catch(() => {});
  }, [pw]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  function upload(e) {
    e.preventDefault();
    setError('');
    if (!file) return setError('Choose a video file');
    if (!title.trim()) return setError('Enter a title');

    const fd = new FormData();
    fd.append('video', file);
    fd.append('title', title);
    fd.append('description', description);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', apiUrl('/api/links'));
    xhr.setRequestHeader('x-admin-password', pw);
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 100));
    };
    xhr.onload = () => {
      setProgress(null);
      if (xhr.status >= 200 && xhr.status < 300) {
        setTitle(''); setDescription(''); setFile(null);
        document.getElementById('video-input').value = '';
        refresh();
      } else {
        setError('Upload failed');
      }
    };
    xhr.onerror = () => { setProgress(null); setError('Upload failed'); };
    setProgress(0);
    xhr.send(fd);
  }

  async function toggleRevoke(link) {
    await api(`/api/links/${link.id}`, pw, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revoked: !link.revoked }),
    });
    refresh();
  }

  async function remove(link) {
    if (!confirm(`Delete "${link.title}" permanently? This removes the video file.`)) return;
    await api(`/api/links/${link.id}`, pw, { method: 'DELETE' });
    refresh();
  }

  function shareUrl(link) {
    return `${window.location.origin}/view/${link.token}`;
  }

  function copy(link) {
    navigator.clipboard.writeText(shareUrl(link));
    setCopied(link.id);
    setTimeout(() => setCopied((c) => (c === link.id ? null : c)), 1500);
  }

  return (
    <Shell>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <div className="flex items-center justify-between pt-8">
          <h1 className="font-headline text-3xl font-semibold text-stone-900">Demo links</h1>
          <button onClick={onLogout} className="text-sm text-stone-500 hover:text-stone-800 underline">
            Log out
          </button>
        </div>

        {/* Upload card */}
        <form
          onSubmit={upload}
          className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"
        >
          <h2 className="font-label text-[13px] font-bold uppercase tracking-wide text-stone-500">
            New demo
          </h2>
          <div className="mt-4 flex flex-col gap-4">
            <div>
              <label className="block text-sm font-semibold text-stone-700 mb-1.5">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. DeciOps Platform Walkthrough"
                className="w-full rounded-lg border border-stone-300 px-4 py-2.5 text-[15px] outline-none focus:border-[#a5351e] focus:ring-1 focus:ring-[#a5351e]"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-stone-700 mb-1.5">
                Description / notes
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="Context shown to the viewer beneath the video…"
                className="w-full resize-y rounded-lg border border-stone-300 px-4 py-2.5 text-[15px] outline-none focus:border-[#a5351e] focus:ring-1 focus:ring-[#a5351e]"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-stone-700 mb-1.5">Video file</label>
              <input
                id="video-input"
                type="file"
                accept="video/*"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="block w-full text-sm text-stone-600 file:mr-4 file:rounded-lg file:border-0 file:bg-stone-900 file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-white hover:file:bg-stone-700"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            {progress !== null && (
              <div className="w-full">
                <div className="h-2 w-full overflow-hidden rounded-full bg-stone-200">
                  <div
                    className="h-full bg-gradient-to-r from-[#a5351e] to-[#c74d34] transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-stone-500">Uploading… {progress}%</p>
              </div>
            )}

            <button
              type="submit"
              disabled={progress !== null}
              className="self-start rounded-lg bg-gradient-to-r from-[#a5351e] to-[#c74d34] px-6 py-3 font-label text-[14px] font-bold uppercase tracking-wide text-white hover:opacity-90 disabled:opacity-50"
            >
              {progress !== null ? 'Uploading…' : 'Generate link'}
            </button>
          </div>
        </form>

        {/* Links list */}
        <div className="mt-8 flex flex-col gap-3">
          {links.length === 0 && (
            <p className="py-10 text-center text-stone-400">No demo links yet.</p>
          )}
          {links.map((link) => (
            <div
              key={link.id}
              className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-semibold text-stone-900">{link.title}</h3>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                        link.revoked
                          ? 'bg-red-100 text-red-700'
                          : 'bg-green-100 text-green-700'
                      }`}
                    >
                      {link.revoked ? 'Revoked' : 'Active'}
                    </span>
                  </div>
                  {link.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-stone-500">{link.description}</p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-400">
                    <span>{new Date(link.createdAt).toLocaleString()}</span>
                    <span>{link.views || 0} views</span>
                    <span>{(link.size / 1048576).toFixed(1)} MB</span>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <code className="truncate rounded-md bg-stone-100 px-2.5 py-1.5 text-xs text-stone-600">
                      {shareUrl(link)}
                    </code>
                    <button
                      onClick={() => copy(link)}
                      className="shrink-0 rounded-md border border-stone-300 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                    >
                      {copied === link.id ? 'Copied!' : 'Copy'}
                    </button>
                    <a
                      href={shareUrl(link)}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 rounded-md border border-stone-300 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                    >
                      Open
                    </a>
                  </div>
                </div>

                <div className="flex shrink-0 flex-col gap-2">
                  <button
                    onClick={() => toggleRevoke(link)}
                    className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                      link.revoked
                        ? 'bg-green-600 text-white hover:bg-green-700'
                        : 'bg-stone-900 text-white hover:bg-stone-700'
                    }`}
                  >
                    {link.revoked ? 'Restore' : 'Revoke'}
                  </button>
                  <button
                    onClick={() => remove(link)}
                    className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
}
