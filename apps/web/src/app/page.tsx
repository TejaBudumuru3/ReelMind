'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Video, History, Plus, Settings2, Play, CheckCircle2, ChevronDown, ClipboardPaste, X } from 'lucide-react';
import { createSessionAction } from './actions';
import { ingestVideo } from '@/lib/api';

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
    'Hook Retention',
    'Speech Cadence',
    'Viral Mechanics'
  ]);

  const FOCUS_OPTIONS = [
    { id: 'Hook Retention', label: 'Hook Retention', activeClass: 'bg-[#3b82f6]/10 border-[#3b82f6]/50 text-[#3b82f6]' },
    { id: 'Speech Cadence', label: 'Speech Cadence', activeClass: 'bg-[#3b82f6]/10 border-[#3b82f6]/50 text-[#3b82f6]' },
    { id: 'Viral Mechanics', label: 'Viral Mechanics', activeClass: 'bg-[#3b82f6]/10 border-[#3b82f6]/50 text-[#3b82f6]' },
    { id: 'CTA Impact', label: 'CTA Impact', activeClass: 'bg-[#3b82f6]/10 border-[#3b82f6]/50 text-[#3b82f6]' },
    { id: 'Pacing & Dropoff', label: 'Pacing & Dropoff', activeClass: 'bg-[#3b82f6]/10 border-[#3b82f6]/50 text-[#3b82f6]' }
  ];

  const toggleFocus = (id: string) => {
    setSelectedFocus(prev =>
      prev.includes(id) ? (prev.length > 1 ? prev.filter(item => item !== id) : prev) : [...prev, id]
    );
  };

  const [apiCredits, setApiCredits] = useState<number | null>(null);

  // Pipeline Logs
  const [pipelineStep, setPipelineStep] = useState<number>(0);
  const PIPELINE_LOGS = [
    "Fetching Stream Metadata & SRT...",
    "Running Whisper Audio Alignment...",
    "Extracting Retention Drops & Hook Delta...",
    "Vectorizing Jina v3 Embeddings...",
    "Finalizing Workspace..."
  ];

  // History State
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    // Fetch real history on mount
    import('./actions').then(m => {
      m.getHistoryAction().then(data => setHistory(data)).catch(console.error);
      m.getUserDataAction().then(user => {
        if (user) setApiCredits(user.api_credits);
      }).catch(console.error);
    });
  }, []);

  const getPlatformBadge = (url: string) => {
    if (!url) return <Video size={18} />;
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      return <div className="flex items-center gap-1 text-[#ef4444] font-bold text-[10px] bg-[#ef4444]/10 px-1.5 py-0.5 rounded border border-[#ef4444]/20"><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/></svg> YT</div>;
    }
    if (url.includes('tiktok.com')) {
      return <div className="flex items-center gap-1 text-[#2dd4bf] font-bold text-[10px] bg-[#2dd4bf]/10 px-1.5 py-0.5 rounded border border-[#2dd4bf]/20"><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93v7.2c0 1.63-.52 3.23-1.48 4.54-1.28 1.73-3.23 2.75-5.32 3-2.09.24-4.22-.31-5.91-1.59-1.52-1.16-2.58-2.88-2.92-4.78-.32-1.81.04-3.69.96-5.24 1.14-1.92 3.13-3.19 5.31-3.41v4.14c-1.35.21-2.57 1.05-3.21 2.22-.64 1.17-.67 2.65-.08 3.86.59 1.2 1.83 2.05 3.16 2.22 1.33.16 2.7-.27 3.65-1.19.93-.91 1.45-2.22 1.45-3.55v-15.48h3.58z"/></svg> TT</div>;
    }
    if (url.includes('instagram.com')) {
      return <div className="flex items-center gap-1 text-[#f43f5e] font-bold text-[10px] bg-[#f43f5e]/10 px-1.5 py-0.5 rounded border border-[#f43f5e]/20"><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg> IG</div>;
    }
    if (url.includes('x.com') || url.includes('twitter.com')) {
      return <div className="flex items-center gap-1 text-white font-bold text-[10px] bg-white/10 px-1.5 py-0.5 rounded border border-white/20"><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg> X</div>;
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
    setError('');
    setIsProcessing(true);
    setPipelineStep(0);

    // Simulate modal processing steps
    const stepInterval = setInterval(() => {
      setPipelineStep(prev => prev < PIPELINE_LOGS.length - 1 ? prev + 1 : prev);
    }, 600);

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

      clearInterval(stepInterval);
      setPipelineStep(PIPELINE_LOGS.length - 1);

      setTimeout(() => {
        router.push(`/session/${sessionId}${query}`);
      }, 500); // Brief delay to show completion

    } catch (err: any) {
      clearInterval(stepInterval);
      setError(err.message || 'An error occurred during ingestion.');
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
          {apiCredits !== null && (
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-[#18181c] border border-[#27272a] rounded-md text-sm font-medium">
              <span className="text-[#94a3b8]">Credits:</span>
              <span className={apiCredits > 0 ? "text-[#10b981]" : "text-[#f43f5e]"}>{apiCredits}</span>
            </div>
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
              Ingestion <span className="text-[#3b82f6]">Hub</span>
            </h1>
            <p className="text-[#94a3b8] text-sm sm:text-base max-w-lg mx-auto">
              Initialize a new performance analysis workspace. Paste your video links to extract retention mechanics, speech pacing, and AI intent classification.
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
                  onClick={() => { setMode('single'); setUrlA('https://x.com/elonmusk/status/1785507963363639598'); setUrlB(''); }}
                  className="px-2 py-1 text-xs rounded border border-[#27272a] bg-[#18181c] text-[#94a3b8] hover:text-white hover:border-[#3b82f6] transition-colors"
                >
                  Viral X Post
                </button>
                <button 
                  type="button" 
                  onClick={() => { setMode('compare'); setUrlA('https://x.com/cb_doge/status/1806322923727659473'); setUrlB('https://x.com/elonmusk/status/1785507963363639598'); }}
                  className="px-2 py-1 text-xs rounded border border-[#27272a] bg-[#18181c] text-[#94a3b8] hover:text-white hover:border-[#3b82f6] transition-colors"
                >
                  X Compare
                </button>
                <button 
                  type="button" 
                  onClick={() => { setMode('single'); setUrlA('https://www.tiktok.com/@tiktok/video/7106594312292453678'); setUrlB(''); }}
                  className="px-2 py-1 text-xs rounded border border-[#27272a] bg-[#18181c] text-[#94a3b8] hover:text-white hover:border-[#3b82f6] transition-colors"
                >
                  Viral TikTok
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
                      <label className="text-[10px] font-mono text-[#94a3b8] uppercase tracking-wider">Extraction Focus (Video Analytics)</label>
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

              {/* Launch CTA */}
              <button
                type="submit"
                disabled={isProcessing}
                className="w-full mt-6 bg-white hover:bg-neutral-200 text-black font-semibold py-3.5 rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-70 disabled:cursor-not-allowed group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white relative overflow-hidden"
              >
                <span className="relative z-10 flex items-center gap-2">
                  {isProcessing ? 'Initializing Workspace...' : 'Launch Ingestion Pipeline'}
                  {!isProcessing && <Play size={18} className="group-hover:translate-x-1 transition-transform" />}
                </span>
                {!isProcessing && (
                  <kbd className="absolute right-4 px-2 py-1 bg-black/10 rounded font-mono text-[10px] tracking-widest text-black/60 font-bold">⌘ ↵</kbd>
                )}
                {/* Loading Shimmer */}
                {isProcessing && (
                  <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-black/10 to-transparent z-0"></div>
                )}
              </button>
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
            <div className="w-full max-w-md bg-[#121215] border border-[#27272a] rounded-2xl shadow-2xl p-8 flex flex-col items-center">
              <div className="w-16 h-16 rounded-full bg-[#18181c] border border-[#27272a] flex items-center justify-center mb-6 relative overflow-hidden">
                <div className="absolute inset-0 border-t-2 border-[#3b82f6] rounded-full animate-spin"></div>
                <Video size={24} className="text-[#3b82f6]" />
              </div>
              <h2 className="font-display text-xl font-bold text-white mb-2">Initializing Workspace</h2>
              <p className="text-sm text-[#94a3b8] text-center mb-8">Please wait while the secure pipeline extracts your video data...</p>

              <div className="w-full space-y-3 font-mono text-xs">
                {PIPELINE_LOGS.map((log, idx) => {
                  const isActive = idx === pipelineStep;
                  const isDone = idx < pipelineStep;
                  const isPending = idx > pipelineStep;
                  return (
                    <div key={idx} className={`flex items-center gap-3 transition-opacity duration-300 ${isPending ? 'opacity-30' : 'opacity-100'}`}>
                      {isDone ? <CheckCircle2 size={14} className="text-[#10b981]" /> :
                        isActive ? <div className="w-3.5 h-3.5 rounded-full border-2 border-[#3b82f6] border-t-transparent animate-spin"></div> :
                          <div className="w-3.5 h-3.5 rounded-full border border-[#3f3f46]"></div>}
                      <span className={`${isActive ? 'text-white' : isDone ? 'text-[#94a3b8]' : 'text-[#3f3f46]'}`}>{log}</span>
                    </div>
                  )
                })}
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
      </AnimatePresence>

    </div>
  );
}
