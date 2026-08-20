'use client';

import React, { useState, useEffect, use } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import InspectorPane from './components/InspectorPane';
import StagePane from './components/StagePane';
import CopilotPane from './components/CopilotPane';
import { SessionState, TranscriptLine, VideoItem, MetricData, ChatMessage } from './types';
import { getHistoryAction } from "@/app/actions";
import { Clock, Plus } from "lucide-react";
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from "react-resizable-panels";
import { ingestVideo } from "@/lib/api";

export default function SessionWorkbenchPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const sessionId = resolvedParams.id;
  const searchParams = useSearchParams();
  const router = useRouter();

  const jobA = searchParams.get("jobA");
  const jobB = searchParams.get("jobB");

  const [jobAStatus, setJobAStatus] = useState(jobA ? "PENDING" : "NONE");
  const [jobBStatus, setJobBStatus] = useState(jobB ? "PENDING" : "NONE");

  const [jobASubStatus, setJobASubStatus] = useState<string | null>(null);
  const [jobBSubStatus, setJobBSubStatus] = useState<string | null>(null);

  const [jobAError, setJobAError] = useState<string | null>(null);
  const [jobBError, setJobBError] = useState<string | null>(null);

  // Real data state
  const [videoA, setVideoA] = useState<any>(null);
  const [videoB, setVideoB] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Master State
  const [sessionState, setSessionState] = useState<SessionState & { activeVideoId: 'A' | 'B' }>({
    sessionId: sessionId,
    monitorMode: 'single',
    activeVideoId: 'A',
    currentTimeSeconds: 0,
    isPlaying: false,
    playbackSpeed: 1.0,
    mobileTab: 'stage',
    commandPaletteOpen: false
  });

  const [leftTab, setLeftTab] = useState<'transcript' | 'queue'>('queue');
  const [searchQuery, setSearchQuery] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  // Fetch History on mount and when sidebar opens
  useEffect(() => {
    getHistoryAction().then(data => setHistory(data)).catch(console.error);
  }, []);

  useEffect(() => {
    if (historyOpen) {
      getHistoryAction().then(data => setHistory(data)).catch(console.error);
    }
  }, [historyOpen]);

  // Fetch Chat Messages
  useEffect(() => {
    const fetchChat = async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/chat/${sessionId}`);
        if (res.ok) {
          const data = await res.json();
          const mapped = data.messages.map((m: any) => ({
            id: m.id,
            sender: m.role === 'AI' ? 'ai' : 'user',
            text: m.content,
            timestamp: m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
          }));
          setChatMessages(mapped);
        }
      } catch (err) {
        console.error("Failed to load chat history", err);
      }
    };
    if (sessionId) fetchChat();
  }, [sessionId]);

  // Polling Loop
  useEffect(() => {
    const pollJob = async (jobId: string, setStatus: (s: string) => void, setSubStatus: (s: string | null) => void, setVideo: (v: any) => void, setError: (e: string) => void) => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/job/${jobId}/status`, { cache: 'no-store' });
        const data = await res.json();
        setStatus(data.status);
        if (data.sub_status) setSubStatus(data.sub_status);
        if (data.status === "COMPLETED" && data.job_data) {
          setVideo(data.job_data);
        } else if (data.status === "FAILED" && data.error) {
          setError(data.error);
        }
        return data.status;
      } catch {
        return null;
      }
    };

    const interval = setInterval(async () => {
      let aDone = !jobA || ["COMPLETED", "FAILED", "NONE"].includes(jobAStatus);
      let bDone = !jobB || ["COMPLETED", "FAILED", "NONE"].includes(jobBStatus);

      if (!aDone && jobA) {
        const s = await pollJob(jobA, setJobAStatus, setJobASubStatus, setVideoA, setJobAError);
        if (s && ["COMPLETED", "FAILED"].includes(s)) aDone = true;
      }
      if (!bDone && jobB) {
        const s = await pollJob(jobB, setJobBStatus, setJobBSubStatus, setVideoB, setJobBError);
        if (s && ["COMPLETED", "FAILED"].includes(s)) bDone = true;
      }

      if (aDone && bDone) clearInterval(interval);
    }, 3000);

    // Initial poll
    if (jobA && !["COMPLETED", "FAILED", "NONE"].includes(jobAStatus)) pollJob(jobA, setJobAStatus, setJobASubStatus, setVideoA, setJobAError);
    if (jobB && !["COMPLETED", "FAILED", "NONE"].includes(jobBStatus)) pollJob(jobB, setJobBStatus, setJobBSubStatus, setVideoB, setJobBError);

    return () => clearInterval(interval);
  }, [jobA, jobB, jobAStatus, jobBStatus]);

  const handleIngestB = async (url: string) => {
    const data = await ingestVideo(url, sessionId, "B");
    setJobBStatus("PENDING");
    router.push(`/session/${sessionId}?jobA=${jobA}&jobB=${data.job_id}`);
  };

  // Chat Submission Logic (SSE)
  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isStreaming) return;

    const userMsg: ChatMessage = { id: Date.now().toString(), sender: 'user', text, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
    setChatMessages(prev => [...prev, userMsg]);
    setIsStreaming(true);

    const aiMsgId = (Date.now() + 1).toString();
    setChatMessages(prev => [...prev, { id: aiMsgId, sender: 'ai', text: '', timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);

    try {
      const focusJobId = sessionState.monitorMode === 'single' ? (sessionState.activeVideoId === 'A' ? jobA : jobB) : undefined;
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, message: text, focus_job_id: focusJobId }),
      });

      if (!res.body) throw new Error("No body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              setChatMessages((prev) => {
                const newMsgs = [...prev];
                const lastIdx = newMsgs.length - 1;
                newMsgs[lastIdx] = { ...newMsgs[lastIdx], text: newMsgs[lastIdx].text + data.text };
                return newMsgs;
              });
            } catch (e) { }
          }
        }
      }
    } catch (error) {
      console.error(error);
      setChatMessages((prev) => {
        const newMsgs = [...prev];
        newMsgs[newMsgs.length - 1].text = "Sorry, an error occurred communicating with the AI.";
        return newMsgs;
      });
    } finally {
      setIsStreaming(false);
    }
  };

  // Playback Loop (Mocking Video Time)
  useEffect(() => {
    let interval: NodeJS.Timeout;
    const activeVideo = sessionState.activeVideoId === 'A' ? videoA : videoB;
    const activeStatus = sessionState.activeVideoId === 'A' ? jobAStatus : jobBStatus;
    const currentDuration = activeVideo?.duration || 0;

    if (sessionState.isPlaying && activeStatus === 'COMPLETED' && currentDuration > 0) {
      interval = setInterval(() => {
        setSessionState(prev => {
          const nextTime = prev.currentTimeSeconds + (0.1 * prev.playbackSpeed);
          if (nextTime >= currentDuration) {
            return { ...prev, currentTimeSeconds: currentDuration, isPlaying: false };
          }
          return { ...prev, currentTimeSeconds: nextTime };
        });
      }, 100);
    } else if (sessionState.isPlaying && (activeStatus !== 'COMPLETED' || currentDuration === 0)) {
      // Auto-pause if video fails or is still processing
      setSessionState(prev => ({ ...prev, isPlaying: false, currentTimeSeconds: 0 }));
    }
    return () => clearInterval(interval);
  }, [sessionState.isPlaying, sessionState.playbackSpeed, sessionState.activeVideoId, videoA, videoB, jobAStatus, jobBStatus]);

  // Keyboard Shortcuts Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setSessionState(prev => {
          const activeVideo = prev.activeVideoId === 'A' ? videoA : videoB;
          const activeStatus = prev.activeVideoId === 'A' ? jobAStatus : jobBStatus;
          if (activeStatus !== 'COMPLETED' || !activeVideo) return prev;
          
          const currentDuration = activeVideo?.duration || 0;
          if (!prev.isPlaying && prev.currentTimeSeconds >= currentDuration) {
            return { ...prev, isPlaying: true, currentTimeSeconds: 0 };
          }
          return { ...prev, isPlaying: !prev.isPlaying };
        });
      } else if (e.code === 'KeyJ') {
        setSessionState(prev => ({ ...prev, currentTimeSeconds: Math.max(0, prev.currentTimeSeconds - 5) }));
      } else if (e.code === 'KeyL') {
        setSessionState(prev => ({ ...prev, currentTimeSeconds: Math.min(videoA?.duration || 420, prev.currentTimeSeconds + 5) }));
      } else if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSessionState(prev => ({ ...prev, commandPaletteOpen: !prev.commandPaletteOpen }));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [videoA]);

  const seekToFrame = (seconds: number) => {
    setSessionState(prev => ({
      ...prev,
      currentTimeSeconds: seconds,
      mobileTab: window.innerWidth < 1024 ? 'stage' : prev.mobileTab
    }));
  };

  // Maps DB data to UI Props
  const mapToQueue = (): VideoItem[] => {
    const q: VideoItem[] = [];
    if (videoA) q.push({ id: jobA as string, title: videoA.title || 'Video A', channel: videoA.creator || 'Creator A', durationSeconds: videoA.duration || 0, thumbnailUrl: videoA.thumbnail_url || '', views: videoA.views?.toString() || '0' });
    if (videoB) q.push({ id: jobB as string, title: videoB.title || 'Video B', channel: videoB.creator || 'Creator B', durationSeconds: videoB.duration || 0, thumbnailUrl: videoB.thumbnail_url || '', views: videoB.views?.toString() || '0' });
    return q;
  };

  const mapToTranscript = (): TranscriptLine[] => {
    const activeData = sessionState.activeVideoId === 'A' ? videoA : videoB;
    if (!activeData || !activeData.transcript) return [];
    
    // Filter out empty sentences to avoid weird empty blocks
    const sentences = activeData.transcript.split(/(?<=\.)\s+/).filter((s: string) => s.trim().length > 0);
    
    // Evenly distribute sentences across the entire video duration
    const duration = activeData.duration || Math.max(10, sentences.length * 5);
    const timeInterval = sentences.length > 1 ? duration / sentences.length : duration;

    return sentences.map((s: string, i: number) => {
      const totalSecs = Math.floor(i * timeInterval);
      const h = Math.floor(totalSecs / 3600);
      const m = Math.floor((totalSecs % 3600) / 60);
      const sec = Math.floor(totalSecs % 60);

      return {
        id: `t_${i}`,
        seconds: totalSecs,
        timecode: `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}:00`,
        speaker: activeData.creator || `Video ${sessionState.activeVideoId}`,
        text: s
      };
    });
  };

  const mapToMetrics = (vid: any): MetricData => {
    return {
      views: vid?.views || 0,
      likes: vid?.likes || 0,
      comments: vid?.comments || 0,
      engagementRate: vid?.engagement_rate || 0,
      followerCount: vid?.follower_count || 0,
      thumbnailUrl: vid?.thumbnail_url || vid?.thumbnailUrl || undefined
    };
  };

  const isProcessing = (jobAStatus !== "NONE" && !["COMPLETED", "FAILED"].includes(jobAStatus)) ||
    (jobBStatus !== "NONE" && !["COMPLETED", "FAILED"].includes(jobBStatus));

  return (
    <div className="h-screen w-full flex flex-col bg-[#09090b] text-neutral-200 font-sans overflow-hidden antialiased">

      {/* Top Studio Header */}
      <header className="h-14 border-b border-[#27272a] bg-[#09090b] flex items-center justify-between px-2 sm:px-4 shrink-0 gap-2">
        <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0 overflow-hidden">
          <div className="flex items-center gap-2 cursor-pointer group shrink-0" onClick={() => router.push('/')}>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-[#8b5cf6] to-[#3b82f6] flex items-center justify-center shadow-[0_0_15px_rgba(139,92,246,0.3)] shrink-0">
              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            </div>
            <span className="font-display font-bold text-lg hidden sm:inline-block tracking-tight text-white group-hover:text-[#3b82f6] transition-colors">ReelMind</span>
          </div>
          <div className="h-4 w-px bg-[#27272a] shrink-0"></div>
          <span className="text-xs text-neutral-300 font-medium truncate min-w-0 flex-1" title={videoA?.title || `SESSION // ${sessionId.split('-')[0]}`}>
            {videoA?.title ? (videoB?.title ? `${videoA.title} vs ${videoB.title}` : videoA.title) : `SESSION // ${sessionId.split('-')[0]}`}
          </span>
          {isProcessing && <span className="text-[10px] text-[#f59e0b] font-mono animate-pulse border border-[#f59e0b] px-2 py-0.5 rounded ml-1 sm:ml-2 shrink-0">INGESTING...</span>}
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <button onClick={() => setHistoryOpen(!historyOpen)} className="text-xs text-white bg-[#27272a] hover:bg-[#3f3f46] transition-colors px-2 py-1 rounded flex items-center gap-1 shrink-0" aria-label="Session History">
            <Clock size={12} /> <span className="hidden sm:inline">HISTORY</span>
          </button>
          <div className="flex items-center gap-1 bg-[#18181c] border border-[#27272a] rounded p-0.5 shrink-0">
            <button onClick={() => setSessionState(p => ({ ...p, monitorMode: 'single' }))} className={`px-2 py-1 text-[10px] sm:text-xs font-semibold tracking-wider rounded ${sessionState.monitorMode === 'single' ? 'bg-[#27272a] text-white' : 'text-[#94a3b8] hover:text-white'}`}>SINGLE</button>
            <button onClick={() => setSessionState(p => ({ ...p, monitorMode: 'dual' }))} className={`px-2 py-1 text-[10px] sm:text-xs font-semibold tracking-wider rounded ${sessionState.monitorMode === 'dual' ? 'bg-[#27272a] text-white' : 'text-[#94a3b8] hover:text-white'}`}>COMPARE</button>
          </div>
        </div>
      </header>

      {/* History Sidebar Drawer */}
      {historyOpen && (
        <div className="absolute top-12 left-0 w-72 h-[calc(100vh-48px)] bg-[#121215] border-r border-[#27272a] z-40 p-4 overflow-y-auto shadow-2xl">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Past Sessions</h3>
            <button onClick={() => router.push('/')} className="text-xs bg-[#3b82f6] text-white px-2 py-1 rounded flex items-center gap-1"><Plus size={12} /> New</button>
          </div>
          <div className="space-y-2">
            {history.map(s => {
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
                  setHistoryOpen(false);
                }} className={`p-3 rounded border text-xs cursor-pointer transition-colors ${s.id === sessionId ? 'bg-[#3b82f6]/10 border-[#3b82f6] text-white' : 'bg-[#18181c] border-[#27272a] text-[#94a3b8] hover:border-[#3b82f6]/50'}`}>
                  <div className="font-semibold text-white truncate" title={displayTitle}>{displayTitle}</div>
                  <div className="opacity-70 mt-1 flex items-center justify-between">
                    <span>{s.jobs?.length || 0} Video{s.jobs?.length === 1 ? '' : 's'}</span>
                    <span>{new Date(s.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 3-Column Main Body Grid (Desktop Resizable, Mobile Tabbed) */}
      <div className="flex-1 flex overflow-hidden">

        {/* Desktop Split Panes */}
        <div className="hidden lg:flex w-full h-full overflow-hidden">
          <PanelGroup orientation="horizontal" className="w-full h-full">
            {/* Left Pane: Inspector */}
            <Panel defaultSize="20" minSize="15" maxSize="35" collapsible collapsedSize="0" className="h-full" id="inspector">
              <div className="h-full w-full min-w-0 overflow-hidden">
                <InspectorPane
                  currentTab={leftTab}
                  onTabChange={setLeftTab}
                  transcript={mapToTranscript()}
                  queue={mapToQueue()}
                  currentTime={sessionState.currentTimeSeconds}
                  onSeek={seekToFrame}
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                />
              </div>
            </Panel>

            <PanelResizeHandle className="w-1.5 h-full bg-[#27272a] hover:bg-[#3b82f6] transition-colors cursor-col-resize active:bg-[#3b82f6] z-10" />

            {/* Center Pane: Stage */}
            <Panel defaultSize="55" minSize="30" className="h-full" id="stage">
              <div className="h-full w-full min-w-0 bg-black relative overflow-hidden">
                <StagePane
                  monitorMode={sessionState.monitorMode}
                  isPlaying={sessionState.isPlaying}
                  onTogglePlayback={() => setSessionState(prev => {
                    const activeVideo = prev.activeVideoId === 'A' ? videoA : videoB;
                    const activeStatus = prev.activeVideoId === 'A' ? jobAStatus : jobBStatus;
                    if (activeStatus !== 'COMPLETED' || !activeVideo) return prev;
                    
                    const currentDuration = activeVideo?.duration || 0;
                    if (!prev.isPlaying && prev.currentTimeSeconds >= currentDuration) {
                      return { ...prev, isPlaying: true, currentTimeSeconds: 0 };
                    }
                    return { ...prev, isPlaying: !prev.isPlaying };
                  })}
                  currentTime={sessionState.currentTimeSeconds}
                  totalDuration={(sessionState.activeVideoId === 'A' ? videoA : videoB)?.duration || 0}
                  playbackSpeed={sessionState.playbackSpeed}
                  onSpeedChange={(speed) => setSessionState(p => ({ ...p, playbackSpeed: speed }))}
                  onScrub={seekToFrame}
                  metricsA={mapToMetrics(videoA)}
                  metricsB={videoB ? mapToMetrics(videoB) : undefined}
                  activeVideoId={sessionState.activeVideoId}
                  onSelectVideo={(id) => setSessionState(p => ({ ...p, activeVideoId: id }))}
                  onAddVideoB={handleIngestB}
                  errorA={jobAError}
                  errorB={jobBError}
                  statusA={jobAStatus}
                  subStatusA={jobASubStatus}
                  statusB={jobBStatus}
                  subStatusB={jobBSubStatus}
                />
              </div>
            </Panel>

            <PanelResizeHandle className="w-1.5 h-full bg-[#27272a] hover:bg-[#3b82f6] transition-colors cursor-col-resize active:bg-[#3b82f6] z-10" />

            {/* Right Pane: Copilot */}
            <Panel defaultSize="25" minSize="15" maxSize="40" collapsible collapsedSize="0" className="h-full" id="copilot">
              <div className="h-full w-full min-w-0 overflow-hidden">
                <CopilotPane
                  messages={chatMessages}
                  isStreaming={isStreaming}
                  onSendMessage={handleSendMessage}
                  onTimecodeClick={seekToFrame}
                  isCompare={!!jobB}
                />
              </div>
            </Panel>
          </PanelGroup>
        </div>

        {/* Mobile Tabbed View (Fallback) */}
        <div className="flex lg:hidden w-full h-full">
          {sessionState.mobileTab === 'transcript' && (
            <div className="w-full h-full">
              <InspectorPane
                currentTab={leftTab}
                onTabChange={setLeftTab}
                transcript={mapToTranscript()}
                queue={mapToQueue()}
                currentTime={sessionState.currentTimeSeconds}
                onSeek={seekToFrame}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
              />
            </div>
          )}
          {sessionState.mobileTab === 'stage' && (
            <div className="w-full h-full">
              <StagePane
                monitorMode={sessionState.monitorMode}
                isPlaying={sessionState.isPlaying}
                onTogglePlayback={() => setSessionState(prev => {
                  const activeVideo = prev.activeVideoId === 'A' ? videoA : videoB;
                  const activeStatus = prev.activeVideoId === 'A' ? jobAStatus : jobBStatus;
                  if (activeStatus !== 'COMPLETED' || !activeVideo) return prev;
                  
                  const currentDuration = activeVideo?.duration || 0;
                  if (!prev.isPlaying && prev.currentTimeSeconds >= currentDuration) {
                    return { ...prev, isPlaying: true, currentTimeSeconds: 0 };
                  }
                  return { ...prev, isPlaying: !prev.isPlaying };
                })}
                currentTime={sessionState.currentTimeSeconds}
                totalDuration={(sessionState.activeVideoId === 'A' ? videoA : videoB)?.duration || 0}
                playbackSpeed={sessionState.playbackSpeed}
                onSpeedChange={(speed) => setSessionState(p => ({ ...p, playbackSpeed: speed }))}
                onScrub={seekToFrame}
                metricsA={mapToMetrics(videoA)}
                metricsB={videoB ? mapToMetrics(videoB) : undefined}
                activeVideoId={sessionState.activeVideoId}
                onSelectVideo={(id) => setSessionState(p => ({ ...p, activeVideoId: id }))}
                onAddVideoB={handleIngestB}
              />
            </div>
          )}
          {sessionState.mobileTab === 'copilot' && (
            <div className="w-full h-full">
              <CopilotPane
                messages={chatMessages}
                isStreaming={isStreaming}
                onSendMessage={handleSendMessage}
                onTimecodeClick={seekToFrame}
                isCompare={!!jobB}
              />
            </div>
          )}
        </div>
      </div>

      {/* Mobile Sticky Tab Bar */}
      <div className="lg:hidden h-14 bg-[#121215] border-t border-[#27272a] flex items-center shrink-0">
        <button onClick={() => setSessionState(p => ({ ...p, mobileTab: 'transcript' }))} className={`flex-1 flex flex-col items-center justify-center gap-1 h-full ${sessionState.mobileTab === 'transcript' ? 'text-[#3b82f6]' : 'text-[#94a3b8]'}`}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" /></svg>
          <span className="text-[9px] font-bold tracking-wider">TRANSCRIPT</span>
        </button>
        <button onClick={() => setSessionState(p => ({ ...p, mobileTab: 'stage' }))} className={`flex-1 flex flex-col items-center justify-center gap-1 h-full ${sessionState.mobileTab === 'stage' ? 'text-[#3b82f6]' : 'text-[#94a3b8]'}`}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span className="text-[9px] font-bold tracking-wider">STAGE</span>
        </button>
        <button onClick={() => setSessionState(p => ({ ...p, mobileTab: 'copilot' }))} className={`flex-1 flex flex-col items-center justify-center gap-1 h-full ${sessionState.mobileTab === 'copilot' ? 'text-[#3b82f6]' : 'text-[#94a3b8]'}`}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
          <span className="text-[9px] font-bold tracking-wider">COPILOT</span>
        </button>
      </div>

    </div>
  );
}
