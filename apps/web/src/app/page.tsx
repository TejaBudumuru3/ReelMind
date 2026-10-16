'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Video, History, Plus, Settings2, Play, CheckCircle2, ChevronDown, ClipboardPaste, X, Download } from 'lucide-react';
import { createSessionAction, getUserDataAction, getHistoryAction, logoutAction } from './actions';
import { ingestVideo, ingestDownloadOnly } from '@/lib/api';

export default function HomeIngestionPage() {
  const router = useRouter();

  // 1. Session & Form State
  const [mode, setMode] = useState<'single' | 'compare'>('single');
  const [urlA, setUrlA] = useState<string>('');
  const [urlB, setUrlB] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const [whisperModel, setWhisperModel] = useState<'large-v3' | 'medium.en'>('large-v3');
  const [chunkSize, setChunkSize] = useState<'128T' | '256T'>('128T');
  const [selectedFocus, setSelectedFocus] = useState<string[]>([
    'Core Concepts',
    'Key Takeaways',
    'Topic Breakdown'
  ]);

  const FOCUS_OPTIONS = [
    { id: 'Core Concepts', label: 'Core Concepts', activeClass: 'bg-[#3b82f6]/10 border-[#3b82f6]/50 text-[#3b82f6]' },
    { id: 'Key Takeaways', label: 'Key Takeaways', activeClass: 'bg-[#3b82f6]/10 border-[#3b82f6]/50 text-[#3b82f6]' },
    { id: 'Topic Breakdown', label: 'Topic Breakdown', activeClass: 'bg-[#3b82f6]/10 border-[#3b82f6]/50 text-[#3b82f6]' },
    { id: 'Q&A Grounding', label: 'Q&A Grounding', activeClass: 'bg-[#3b82f6]/10 border-[#3b82f6]/50 text-[#3b82f6]' },
    { id: 'Executive Summary', label: 'Executive Summary', activeClass: 'bg-[#3b82f6]/10 border-[#3b82f6]/50 text-[#3b82f6]' }
  ];

  const toggleFocus = (id: string) => {
    setSelectedFocus(prev =>
      prev.includes(id) ? (prev.length > 1 ? prev.filter(item => item !== id) : prev) : [...prev, id]
    );
  };

  const [apiCredits, setApiCredits] = useState<number | null>(null);



  // User & Auth State
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string; name?: string | null; avatar_url?: string | null; api_credits: number } | null>(null);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);

  // History State
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    getHistoryAction().then(data => setHistory(data)).catch(console.error);
    getUserDataAction().then(user => {
      if (user) {
        setCurrentUser(user);
        setApiCredits(user.api_credits);
      }
    }).catch(console.error);
  }, []);

  const getPlatformBadge = (url: string) => {
    if (!url) return <Video size={18} />;
    if (url.includes('x.com') || url.includes('twitter.com')) {
      return <div className="flex items-center gap-1 text-white font-bold text-[10px] bg-white/10 px-1.5 py-0.5 rounded border border-white/20"><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg> X</div>;
    }
    if (url.includes('instagram.com')) {
      return <div className="flex items-center gap-1 text-[#f43f5e] font-bold text-[10px] bg-[#f43f5e]/10 px-1.5 py-0.5 rounded border border-[#f43f5e]/20"><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg> IG</div>;
    }
    if (url.includes('tiktok.com')) {
      return <div className="flex items-center gap-1 text-[#2dd4bf] font-bold text-[10px] bg-[#2dd4bf]/10 px-1.5 py-0.5 rounded border border-[#2dd4bf]/20"><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93v7.2c0 1.63-.52 3.23-1.48 4.54-1.28 1.73-3.23 2.75-5.32 3-2.09.24-4.22-.31-5.91-1.59-1.52-1.16-2.58-2.88-2.92-4.78-.32-1.81.04-3.69.96-5.24 1.14-1.92 3.13-3.19 5.31-3.41v4.14c-1.35.21-2.57 1.05-3.21 2.22-.64 1.17-.67 2.65-.08 3.86.59 1.2 1.83 2.05 3.16 2.22 1.33.16 2.7-.27 3.65-1.19.93-.91 1.45-2.22 1.45-3.55v-15.48h3.58z"/></svg> TT</div>;
    }
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      return <div className="flex items-center gap-1 text-[#ef4444] font-bold text-[10px] bg-[#ef4444]/10 px-1.5 py-0.5 rounded border border-[#ef4444]/20"><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/></svg> YT</div>;
    }
    try {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        const parsed = new URL(url);
        const host = parsed.hostname.replace(/^www\./, '');
        const domainParts = host.split('.');
        const domainName = (domainParts.length > 1 ? domainParts[0] : host).toUpperCase();
        return (
          <div className="flex items-center gap-1 text-[#38bdf8] font-bold text-[10px] bg-[#38bdf8]/10 px-1.5 py-0.5 rounded border border-[#38bdf8]/20 tracking-wider">
            {domainName}
          </div>
        );
      }
    } catch {
      // Fallback to icon
    }
    return <Video size={18} className="text-[#3b82f6]/70" />;
  };

  const handlePaste = async (target: 'A' | 'B') => {
    try {
      const text = await navigator.clipboard.readText();
      if (target === 'A') setUrlA(text);
      if (target === 'B') setUrlB(text);
    } catch (err) {
      console.error('Failed to read clipboard contents: ', err);
    }
  };

  const handleAnalyze = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!urlA && (mode === 'compare' && !urlB)) {
      setError('Please provide the required video URLs.');
      return;
    }

    // Intercept unauthenticated users
    if (!currentUser) {
      setShowAuthModal(true);
      return;
    }

    setError('');
    setIsProcessing(true);

    try {
      // Execute Real Backend Pipeline
      const sessionId = await createSessionAction();
      const jobs = [];
      if (urlA) jobs.push(ingestVideo(urlA, sessionId, "A"));
      if (mode === 'compare' && urlB) jobs.push(ingestVideo(urlB, sessionId, "B"));

      const results = await Promise.all(jobs);

      let query = "";
      if (mode === 'compare' && urlA && urlB) {
        query = `?jobA=${results[0].job_id}&jobB=${results[1].job_id}`;
      } else if (urlA) {
        query = `?jobA=${results[0].job_id}`;
      }

      router.push(`/session/${sessionId}${query}`);
    } catch (err: any) {
      if (err.message === 'UNAUTHORIZED') {
        setShowAuthModal(true);
      } else {
        setError(err.message || 'An error occurred during ingestion.');
      }
      setIsProcessing(false);
    }
  };

  const handleDirectDownload = async () => {
    if (!urlA) {
      setError('Please provide a video URL to download.');
      return;
    }

    if (!currentUser) {
      setShowAuthModal(true);
      return;
    }

    setError('');
    setIsProcessing(true);

    try {
      const sessionId = await createSessionAction();
      const res = await ingestDownloadOnly(urlA, sessionId, "A");
      router.push(`/session/${sessionId}?jobA=${res.job_id}&download=true`);
    } catch (err: any) {
      if (err.message === 'UNAUTHORIZED') {
        setShowAuthModal(true);
      } else {
        setError(err.message || 'Failed to initialize download session.');
      }
      setIsProcessing(false);
    }
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleAnalyze();
      }
      if (e.key === 'Escape') {
        setDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [urlA, urlB, mode]);

  return (
    <div className="min-h-screen bg-[#09090b] text-neutral-200 font-sans flex flex-col relative overflow-x-hidden selection:bg-[#3b82f6]/30">

      {/* Studio Header HUD */}
      <header className="h-14 border-b border-[#27272a] bg-[#121215]/80 backdrop-blur-md flex items-center justify-between px-6 shrink-0 z-40 fixed top-0 w-full">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-gradient-to-br from-[#3b82f6] to-[#c084fc] flex items-center justify-center shadow-lg shadow-[#3b82f6]/20">
              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            </div>
            <span className="font-display font-bold text-lg tracking-tight text-white">ReelMind</span>
          </div>
          <div className="h-4 w-px bg-[#27272a] hidden sm:block"></div>
          <div className="hidden sm:flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-[#18181c] border border-[#27272a] text-[10px] font-mono text-[#94a3b8] tracking-wider uppercase">RAG WORKER v2.4</span>
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#10b981]/10 border border-[#10b981]/20 text-[10px] font-mono text-[#10b981] tracking-wider uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse"></span>
              Groq Qwen / Jina v3: Online
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {currentUser ? (
            <>
              {apiCredits !== null && (
                <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-[#18181c] border border-[#27272a] rounded-md text-xs font-medium">
                  <span className="text-[#94a3b8]">Credits:</span>
                  <span className={apiCredits > 0 ? "text-[#10b981] font-bold" : "text-[#f43f5e] font-bold"}>{apiCredits}</span>
                </div>
              )}
              <div className="flex items-center gap-2 pl-1">
                {currentUser.avatar_url ? (
                  <img
                    src={currentUser.avatar_url}
                    alt={currentUser.name || "User Avatar"}
                    className="w-8 h-8 rounded-full border border-[#27272a] object-cover"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-[#3b82f6]/20 text-[#3b82f6] border border-[#3b82f6]/40 flex items-center justify-center text-xs font-bold font-mono">
                    {(currentUser.name || currentUser.email)[0].toUpperCase()}
                  </div>
                )}
                <span className="hidden md:inline text-xs font-medium text-zinc-300 max-w-[120px] truncate">
                  {currentUser.name || currentUser.email.split('@')[0]}
                </span>
                <button
                  onClick={async () => {
                    await logoutAction();
                    setCurrentUser(null);
                    setApiCredits(null);
                    setHistory([]);
                  }}
                  className="px-2.5 py-1 text-xs text-[#94a3b8] hover:text-white hover:bg-[#27272a] border border-[#27272a] rounded transition-colors ml-1"
                  title="Sign Out"
                >
                  Sign Out
                </button>
              </div>
            </>
          ) : (
            <a
              href="/api/auth/google"
              className="flex items-center gap-2 px-3.5 py-1.5 bg-white hover:bg-neutral-100 text-neutral-900 font-semibold text-xs rounded-md shadow-sm transition-all hover:scale-[1.02]"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>Sign in</span>
            </a>
          )}

          <button
            onClick={() => setDrawerOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-[#18181c] hover:bg-[#27272a] border border-[#27272a] hover:border-[#3b82f6]/50 rounded-md transition-colors text-sm font-medium text-white group"
          >
            <History size={16} className="text-[#94a3b8] group-hover:text-[#3b82f6] transition-colors" />
            <span className="hidden sm:inline">Session History</span>
            {history.length > 0 && (
              <span className="px-1.5 py-0.5 bg-[#3b82f6]/20 text-[#3b82f6] text-[10px] font-mono rounded-sm">{history.length}</span>
            )}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 pt-24 pb-12 z-10 relative">

        {/* Background Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-br from-[#3b82f6]/10 to-[#c084fc]/10 blur-[100px] pointer-events-none rounded-full" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="w-full max-w-2xl relative z-10"
        >
          <div className="text-center mb-8">
            <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-white mb-3 shadow-black drop-shadow-md">
              Talk to Video <span className="text-[#3b82f6]">Hub</span>
            </h1>
            <p className="text-[#94a3b8] text-sm sm:text-base max-w-lg mx-auto">
              Transform spoken-word videos from X, Instagram Reels, and web media into interactive AI knowledge workspaces. Extract speech, build semantic vectors, and converse directly with the speaker.
            </p>
          </div>

          <div className="bg-[#121215] border border-[#27272a] rounded-xl shadow-2xl overflow-hidden p-6 relative group">
            {/* Mode Switcher */}
            <div className="grid grid-cols-2 p-1 bg-[#09090b] border border-[#27272a] rounded-lg mb-6 w-full sm:w-72 mx-auto" role="tablist">
              <button
                role="tab"
                type="button"
                aria-selected={mode === 'single'}
                onClick={() => setMode('single')}
                className={`py-2 px-4 rounded-md text-xs sm:text-sm font-medium transition-all duration-200 ${mode === 'single' ? 'bg-[#27272a] text-white shadow-sm border border-[#3f3f46]' : 'text-[#94a3b8] hover:text-white'}`}
              >
                Single Focus
              </button>
              <button
                role="tab"
                type="button"
                aria-selected={mode === 'compare'}
                onClick={() => setMode('compare')}
                className={`py-2 px-4 rounded-md text-xs sm:text-sm font-medium transition-all duration-200 ${mode === 'compare' ? 'bg-[#27272a] text-white shadow-sm border border-[#3f3f46]' : 'text-[#94a3b8] hover:text-white'}`}
              >
                A/B Compare
              </button>
            </div>

            <form onSubmit={handleAnalyze} className="space-y-4">
              {/* Video A Input */}
              <div className="space-y-1.5">
                <label htmlFor="urlA" className="text-xs font-semibold text-[#3b82f6] uppercase tracking-wider ml-1">Target Source A</label>
                <div className="relative flex items-center">
                  <div className="absolute left-3 pointer-events-none">
                    {getPlatformBadge(urlA)}
                  </div>
                  <input
                    id="urlA"
                    type="url"
                    required
                    value={urlA}
                    onChange={(e) => setUrlA(e.target.value)}
                    placeholder="https://x.com/..."
                    disabled={isProcessing}
                    className="w-full bg-[#18181c] border border-[#27272a] focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6] rounded-lg py-3 pr-24 pl-24 text-white placeholder:text-[#3f3f46] text-sm transition-all outline-none disabled:opacity-50"
                  />
                  <div className="absolute right-2 flex items-center gap-1">
                    {urlA && (
                      <button type="button" onClick={() => setUrlA('')} className="p-1.5 text-[#94a3b8] hover:text-white hover:bg-[#27272a] rounded transition-colors" aria-label="Clear">
                        <X size={14} />
                      </button>
                    )}
                    <button type="button" onClick={() => handlePaste('A')} className="p-1.5 text-[#94a3b8] hover:text-white hover:bg-[#27272a] rounded transition-colors" aria-label="Paste from clipboard">
                      <ClipboardPaste size={14} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Video B Input (Animated presence) */}
              <AnimatePresence>
                {mode === 'compare' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0, marginTop: 0 }}
                    animate={{ opacity: 1, height: 'auto', marginTop: 16 }}
                    exit={{ opacity: 0, height: 0, marginTop: 0 }}
                    className="space-y-1.5 overflow-hidden"
                  >
                    <label htmlFor="urlB" className="text-xs font-semibold text-[#10b981] uppercase tracking-wider ml-1">Comparison Target B</label>
                    <div className="relative flex items-center">
                      <div className="absolute left-3 pointer-events-none">
                        {getPlatformBadge(urlB)}
                      </div>
                      <input
                        id="urlB"
                        type="url"
                        required={mode === 'compare'}
                        value={urlB}
                        onChange={(e) => setUrlB(e.target.value)}
                        placeholder="https://instagram.com/reels/..."
                        disabled={isProcessing}
                        className="w-full bg-[#18181c] border border-[#27272a] focus:border-[#10b981] focus:ring-1 focus:ring-[#10b981] rounded-lg py-3 pr-24 pl-24 text-white placeholder:text-[#3f3f46] text-sm transition-all outline-none disabled:opacity-50"
                      />
                      <div className="absolute right-2 flex items-center gap-1">
                        {urlB && (
                          <button type="button" onClick={() => setUrlB('')} className="p-1.5 text-[#94a3b8] hover:text-white hover:bg-[#27272a] rounded transition-colors" aria-label="Clear">
                            <X size={14} />
                          </button>
                        )}
                        <button type="button" onClick={() => handlePaste('B')} className="p-1.5 text-[#94a3b8] hover:text-white hover:bg-[#27272a] rounded transition-colors" aria-label="Paste from clipboard">
                          <ClipboardPaste size={14} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Try Demo Buttons */}
              <div className="flex items-center gap-3 pt-2">
                <span className="text-xs font-medium text-[#94a3b8] uppercase tracking-wider">Examples:</span>
                <button 
                  type="button" 
                  onClick={() => { setMode('single'); setUrlA('https://x.com/keyfipyIasimIar/status/2056630939950948391'); setUrlB(''); }}
                  className="px-2 py-1 text-xs rounded border border-[#27272a] bg-[#18181c] text-[#94a3b8] hover:text-white hover:border-[#3b82f6] transition-colors"
                >
                  X Video Clip
                </button>
                <button 
                  type="button" 
                  onClick={() => { setMode('single'); setUrlA('https://www.youtube.com/watch?v=jNQXAC9IVRw'); setUrlB(''); }}
                  className="px-2 py-1 text-xs rounded border border-[#27272a] bg-[#18181c] text-[#94a3b8] hover:text-white hover:border-[#3b82f6] transition-colors"
                >
                  Short Clip (19s)
                </button>
                <button 
                  type="button" 
                  onClick={() => { setMode('compare'); setUrlA('https://x.com/keyfipyIasimIar/status/2056630939950948391'); setUrlB('https://www.youtube.com/watch?v=jNQXAC9IVRw'); }}
                  className="px-2 py-1 text-xs rounded border border-[#27272a] bg-[#18181c] text-[#94a3b8] hover:text-white hover:border-[#3b82f6] transition-colors"
                >
                  X vs Clip Compare
                </button>
              </div>

              {/* Error State */}
              {error && (
                <div className="p-3 bg-[#f43f5e]/10 border border-[#f43f5e]/30 rounded-lg flex items-center gap-2 text-[#f43f5e] text-sm" role="alert">
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                  {error}
                </div>
              )}

              {/* Aesthetic Config Accordion */}
              <details className="group border border-[#27272a] rounded-lg bg-[#18181c] overflow-hidden mt-4">
                <summary className="flex items-center justify-between p-3 cursor-pointer select-none list-none outline-none focus-visible:bg-[#27272a]">
                  <div className="flex items-center gap-2 text-sm font-medium text-[#94a3b8] group-hover:text-white transition-colors">
                    <Settings2 size={16} /> Advanced Pipeline Config
                  </div>
                  <ChevronDown size={16} className="text-[#3f3f46] group-open:rotate-180 transition-transform" />
                </summary>
                <div className="p-4 pt-2 border-t border-[#27272a] grid grid-cols-2 gap-4">
                  <div className="space-y-2 opacity-40 blur-[0.5px] pointer-events-none select-none" title="Managed automatically by the backend">
                    <label className="text-[10px] font-mono text-[#94a3b8] uppercase tracking-wider flex items-center justify-between">
                      Whisper Model <span className="text-[8px] bg-[#27272a] px-1.5 py-0.5 rounded text-[#94a3b8]">AUTO</span>
                    </label>
                    <div className="flex bg-[#09090b] border border-[#27272a] rounded overflow-hidden p-0.5">
                      <button
                        type="button"
                        className={`flex-1 py-1.5 px-2 text-xs rounded font-medium transition-all ${whisperModel === 'large-v3' ? 'text-white bg-[#27272a] shadow-sm border border-[#3f3f46]' : 'text-[#94a3b8] hover:text-white'}`}
                      >
                        large-v3
                      </button>
                      <button
                        type="button"
                        className={`flex-1 py-1.5 px-2 text-xs rounded font-medium transition-all ${whisperModel === 'medium.en' ? 'text-white bg-[#27272a] shadow-sm border border-[#3f3f46]' : 'text-[#94a3b8] hover:text-white'}`}
                      >
                        medium.en
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2 opacity-40 blur-[0.5px] pointer-events-none select-none" title="Managed automatically by the backend">
                    <label className="text-[10px] font-mono text-[#94a3b8] uppercase tracking-wider flex items-center justify-between">
                      Chunking <span className="text-[8px] bg-[#27272a] px-1.5 py-0.5 rounded text-[#94a3b8]">AUTO</span>
                    </label>
                    <div className="flex bg-[#09090b] border border-[#27272a] rounded overflow-hidden p-0.5">
                      <button
                        type="button"
                        className={`flex-1 py-1.5 px-2 text-xs rounded font-medium transition-all ${chunkSize === '128T' ? 'text-white bg-[#27272a] shadow-sm border border-[#3f3f46]' : 'text-[#94a3b8] hover:text-white'}`}
                      >
                        128T
                      </button>
                      <button
                        type="button"
                        className={`flex-1 py-1.5 px-2 text-xs rounded font-medium transition-all ${chunkSize === '256T' ? 'text-white bg-[#27272a] shadow-sm border border-[#3f3f46]' : 'text-[#94a3b8] hover:text-white'}`}
                      >
                        256T
                      </button>
                    </div>
                  </div>
                  <div className="col-span-2 space-y-2 mt-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-mono text-[#94a3b8] uppercase tracking-wider">Analysis Focus (Spoken Knowledge)</label>
                      <span className="text-[10px] font-mono text-[#3b82f6]">{selectedFocus.length} Active</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {FOCUS_OPTIONS.map(opt => {
                        const isSelected = selectedFocus.includes(opt.id);
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => toggleFocus(opt.id)}
                            className={`px-2.5 py-1 text-[11px] sm:text-xs rounded-full border transition-all cursor-pointer select-none ${isSelected
                                ? opt.activeClass
                                : 'bg-[#18181c] border-[#27272a] text-[#71717a] hover:border-[#3f3f46] hover:text-[#94a3b8]'
                              }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </details>

              {/* Launch & Download CTAs */}
              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="flex-1 bg-white hover:bg-neutral-200 text-black font-semibold py-3.5 rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-70 disabled:cursor-not-allowed group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white relative overflow-hidden"
                >
                  <span className="relative z-10 flex items-center gap-2 text-sm">
                    {isProcessing ? 'Initializing Workspace...' : 'Launch Ingestion Pipeline'}
                    {!isProcessing && <Play size={16} className="group-hover:translate-x-1 transition-transform" />}
                  </span>
                  {!isProcessing && (
                    <kbd className="hidden sm:inline-block absolute right-3 px-1.5 py-0.5 bg-black/10 rounded font-mono text-[9px] tracking-widest text-black/60 font-bold">⌘ ↵</kbd>
                  )}
                  {isProcessing && (
                    <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-black/10 to-transparent z-0"></div>
                  )}
                </button>

                {process.env.NEXT_PUBLIC_ENABLE_DOWNLOADS === 'true' && (
                  <button
                    type="button"
                    onClick={handleDirectDownload}
                    disabled={isProcessing}
                    title="Zero duration limit • Direct 4K & 48kHz audio download"
                    className="px-5 py-3.5 bg-[#18181c] hover:bg-[#27272a] text-[#38bdf8] hover:text-white border border-[#38bdf8]/40 hover:border-[#38bdf8] font-semibold text-sm rounded-lg flex items-center justify-center gap-2 transition-all shadow-[0_0_15px_rgba(56,189,248,0.1)] group disabled:opacity-50"
                  >
                    <Download size={16} className="text-[#38bdf8] group-hover:scale-110 transition-transform" />
                    <span>Download Media</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#38bdf8]/10 text-[#38bdf8] border border-[#38bdf8]/30">No Limit</span>
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Benchmark Grid */}
          {history.length > 0 && (
            <div className="mt-12 w-full max-w-4xl mx-auto px-4 sm:px-0">
              <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-4 flex items-center gap-2">
                <Sparkles size={14} className="text-[#3b82f6]" /> Recent Workspaces
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {history.slice(0, 3).map((s: any) => {
                  const jobCount = s.jobs?.length || 0;
                  const isCompare = jobCount >= 2;
                  const qs = isCompare ? `?jobA=${s.jobs[1].id}&jobB=${s.jobs[0].id}` : (jobCount === 1 ? `?jobA=${s.jobs[0].id}` : '');
                  const thumbUrl = s.jobs?.[0]?.thumbnail_url || 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=500&q=80';
                  const displayTitle = s.title && s.title !== 'New Analysis' && s.title !== 'Analysis Session'
                    ? s.title
                    : (s.jobs?.[0]?.title ? s.jobs.map((j: any) => j.title).filter(Boolean).join(' vs ') : 'Video Analysis');

                  return (
                    <div key={s.id} onClick={() => router.push(`/session/${s.id}${qs}`)} className="bg-[#121215] border border-[#27272a] hover:border-[#3b82f6]/50 rounded-lg p-3 cursor-pointer transition-all group overflow-hidden relative">
                      <div className="h-24 w-full rounded mb-3 bg-[#18181c] border border-[#27272a] overflow-hidden relative">
                        <img src={thumbUrl} alt="Thumbnail" className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <div className="flex items-center justify-between mb-2">
                        <div className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-medium ${isCompare ? 'bg-[#10b981]/20 text-[#10b981]' : 'bg-[#3b82f6]/20 text-[#3b82f6]'}`}>
                          {isCompare ? 'COMPARE' : 'SINGLE'}
                        </div>
                        <div className="text-[10px] font-mono text-[#94a3b8]">{new Date(s.created_at).toLocaleDateString()}</div>
                      </div>
                      <h4 className="text-sm font-semibold text-white truncate group-hover:text-[#3b82f6] transition-colors" title={displayTitle}>{displayTitle}</h4>
                      <div className="absolute inset-0 border-2 border-transparent group-active:border-[#3b82f6] rounded-lg transition-colors pointer-events-none"></div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </motion.div>
      </main>

      {/* Processing Pipeline Overlay Modal */}
      <AnimatePresence>
        {isProcessing && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[#09090b]/90 backdrop-blur-xl z-50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="w-full max-w-sm bg-[#121215] border border-[#27272a] rounded-2xl shadow-2xl p-7 flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-2xl bg-[#3b82f6]/10 border border-[#3b82f6]/30 flex items-center justify-center mb-5 relative">
                <div className="absolute inset-0 border-2 border-[#3b82f6] border-t-transparent rounded-2xl animate-spin"></div>
                <Sparkles size={22} className="text-[#3b82f6]" />
              </div>
              <h2 className="font-display text-lg font-bold text-white mb-1.5">Dispatching Pipeline</h2>
              <p className="text-xs text-[#94a3b8] mb-5 leading-relaxed">
                Initializing session workspace and queueing video extraction workers...
              </p>
              <div className="w-full bg-[#18181c] rounded-full h-1.5 overflow-hidden border border-[#27272a]">
                <div className="h-full bg-gradient-to-r from-[#3b82f6] to-[#c084fc] animate-pulse w-full"></div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Session History Slide-Over Drawer */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            />
            <motion.aside
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 h-full w-full sm:w-96 bg-[#121215] border-l border-[#27272a] shadow-2xl z-50 flex flex-col"
              role="dialog"
              aria-modal="true"
            >
              <div className="h-14 border-b border-[#27272a] flex items-center justify-between px-4 shrink-0 bg-[#18181c]">
                <h2 className="font-display font-semibold text-white flex items-center gap-2">
                  <History size={18} className="text-[#3b82f6]" /> Session History
                </h2>
                <button onClick={() => setDrawerOpen(false)} className="p-2 text-[#94a3b8] hover:text-white hover:bg-[#27272a] rounded-md transition-colors" aria-label="Close drawer">
                  <X size={18} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {history.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center px-4">
                    <div className="w-12 h-12 rounded-full bg-[#18181c] border border-[#27272a] flex items-center justify-center mb-3">
                      <History size={20} className="text-[#3f3f46]" />
                    </div>
                    <p className="text-sm font-medium text-white mb-1">No Past Sessions</p>
                    <p className="text-xs text-[#94a3b8]">Your previously indexed workspaces will appear here.</p>
                  </div>
                ) : (
                  history.map(s => {
                    const jobCount = s.jobs?.length || 0;
                    const isCompare = jobCount >= 2;
                    const displayTitle = s.title && s.title !== 'New Analysis' && s.title !== 'Analysis Session'
                      ? s.title
                      : (s.jobs?.[0]?.title ? s.jobs.map((j: any) => j.title).filter(Boolean).join(' vs ') : 'Video Analysis');

                    return (
                      <div key={s.id} onClick={() => {
                        const jobAId = s.jobs?.find((j: any) => j.label === 'A')?.id || (s.jobs?.[0]?.id);
                        const jobBId = s.jobs?.find((j: any) => j.label === 'B')?.id || (s.jobs?.length > 1 ? s.jobs?.[1]?.id : undefined);
                        const qsParts = [];
                        if (jobAId) qsParts.push(`jobA=${jobAId}`);
                        if (jobBId && jobBId !== jobAId) qsParts.push(`jobB=${jobBId}`);
                        const qs = qsParts.length > 0 ? `?${qsParts.join('&')}` : '';
                        router.push(`/session/${s.id}${qs}`);
                      }} className="p-3 bg-[#18181c] border border-[#27272a] hover:border-[#3b82f6]/50 rounded-lg cursor-pointer transition-colors group">
                        <div className="flex items-center justify-between mb-2">
                          <div className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-medium ${isCompare ? 'bg-[#10b981]/20 text-[#10b981]' : 'bg-[#3b82f6]/20 text-[#3b82f6]'}`}>
                            {isCompare ? 'COMPARE MODE' : 'SINGLE FOCUS'}
                          </div>
                          <div className="text-[10px] font-mono text-[#94a3b8]">{new Date(s.created_at).toLocaleDateString()}</div>
                        </div>
                        <h4 className="text-sm font-semibold text-white group-hover:text-[#3b82f6] transition-colors truncate" title={displayTitle}>{displayTitle}</h4>
                        <p className="text-xs text-[#94a3b8] mt-1 flex items-center gap-1"><Video size={12} /> {jobCount} Video{jobCount !== 1 ? 's' : ''} Indexed</p>
                      </div>
                    )
                  })
                )}
              </div>
              <div className="p-4 border-t border-[#27272a] bg-[#18181c]">
                <button className="w-full py-2 bg-[#09090b] border border-[#27272a] hover:border-[#f43f5e]/50 hover:text-[#f43f5e] rounded-md text-xs font-semibold text-[#94a3b8] transition-colors uppercase tracking-wider">
                  Clear Cache
                </button>
              </div>
            </motion.aside>
          </>
        )}

        {/* Google Authentication Modal Popup */}
        {showAuthModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAuthModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-md bg-[#121215] border border-[#27272a] rounded-2xl p-6 sm:p-8 shadow-2xl z-10 overflow-hidden"
            >
              {/* Close Button */}
              <button
                onClick={() => setShowAuthModal(false)}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/60 transition-colors"
                title="Close"
              >
                <X size={18} />
              </button>

              <div className="flex flex-col items-center text-center">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#3b82f6]/20 to-[#c084fc]/20 border border-[#3b82f6]/30 flex items-center justify-center mb-5 shadow-lg shadow-[#3b82f6]/10">
                  <svg className="w-7 h-7 text-[#3b82f6]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>

                <h3 className="text-xl sm:text-2xl font-bold font-display text-white tracking-tight mb-2">
                  Sign in to ReelMind
                </h3>
                <p className="text-sm text-zinc-400 mb-6 max-w-xs leading-relaxed">
                  Log in with Google to launch video analysis, track retention drops, and receive <span className="text-[#10b981] font-semibold">10 free credits</span>.
                </p>

                <div className="w-full space-y-2.5 mb-6 text-left">
                  <div className="flex items-center gap-3 p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800/80 text-xs text-zinc-300">
                    <div className="w-5 h-5 rounded-full bg-[#10b981]/20 text-[#10b981] flex items-center justify-center shrink-0 text-[10px]">✓</div>
                    <span>Instant multi-platform video ingestion</span>
                  </div>
                  <div className="flex items-center gap-3 p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800/80 text-xs text-zinc-300">
                    <div className="w-5 h-5 rounded-full bg-[#10b981]/20 text-[#10b981] flex items-center justify-center shrink-0 text-[10px]">✓</div>
                    <span>AI Copilot with RAG vector search</span>
                  </div>
                  <div className="flex items-center gap-3 p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800/80 text-xs text-zinc-300">
                    <div className="w-5 h-5 rounded-full bg-[#10b981]/20 text-[#10b981] flex items-center justify-center shrink-0 text-[10px]">✓</div>
                    <span>10 free video credits added to your account</span>
                  </div>
                </div>

                <a
                  href="/api/auth/google"
                  className="w-full py-3 px-4 bg-white hover:bg-neutral-100 text-neutral-900 font-semibold text-sm rounded-xl flex items-center justify-center gap-3 transition-all shadow-lg hover:shadow-xl hover:scale-[1.01] active:scale-[0.99]"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  <span>Continue with Google</span>
                </a>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
