'use client';

import React, { useRef, useState } from 'react';
import { MetricData } from '../types';

interface StagePaneProps {
  monitorMode: 'single' | 'dual';
  isPlaying: boolean;
  onTogglePlayback: () => void;
  currentTime: number;
  totalDuration: number;
  playbackSpeed: number;
  onSpeedChange: (speed: number) => void;
  onScrub: (seconds: number) => void;
  metricsA: MetricData;
  metricsB?: MetricData;
  activeVideoId: 'A' | 'B';
  onSelectVideo: (id: 'A' | 'B') => void;
  onAddVideoB?: (url: string) => void | Promise<void>;
  errorA?: string | null;
  errorB?: string | null;
  statusA?: string;
  subStatusA?: string | null;
  statusB?: string;
  subStatusB?: string | null;
}

const STAGES = [
  { id: 'PENDING', label: 'Initializing Job' },
  { id: 'EXTRACTING_METADATA', label: 'Extracting Metadata' },
  { id: 'TRANSCRIBING', label: 'Transcribing Audio' },
  { id: 'EMBEDDING', label: 'Generating Embeddings' },
  { id: 'READY', label: 'Finalizing' }
];

function ProcessingOverlay({ status, subStatus }: { status: string, subStatus: string | null }) {
  const currentIndex = STAGES.findIndex(s => s.id === (subStatus || status));
  
  return (
    <div className="absolute inset-0 bg-[#09090b]/80 backdrop-blur-md flex flex-col items-center justify-center p-6 z-30 font-mono">
      <div className="w-full max-w-sm space-y-4">
        <div className="flex items-center justify-between mb-6">
          <span className="text-[#3b82f6] font-bold tracking-widest text-sm animate-pulse">INGESTING PIPELINE</span>
          <div className="w-4 h-4 rounded-full border-2 border-[#3b82f6] border-t-transparent animate-spin"></div>
        </div>
        
        <div className="space-y-3 relative">
          <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-[#27272a] z-0"></div>
          
          {STAGES.map((stage, i) => {
            const isCompleted = currentIndex > i;
            const isCurrent = currentIndex === i;
            
            return (
              <div key={stage.id} className="flex items-center gap-3 relative z-10">
                <div className={`w-4 h-4 rounded-full flex items-center justify-center border-2 transition-colors duration-300 ${
                  isCompleted ? 'bg-[#10b981] border-[#10b981]' :
                  isCurrent ? 'bg-[#09090b] border-[#3b82f6]' :
                  'bg-[#09090b] border-[#27272a]'
                }`}>
                  {isCompleted && <svg className="w-2.5 h-2.5 text-[#09090b]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                </div>
                <span className={`text-xs transition-colors duration-300 ${
                  isCompleted ? 'text-[#10b981]' :
                  isCurrent ? 'text-white font-semibold' :
                  'text-[#52525b]'
                }`}>
                  {stage.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function formatTimecode(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const f = Math.floor((seconds % 1) * 30); // Mock 30fps
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${f.toString().padStart(2, '0')}`;
}

export default function StagePane({
  monitorMode,
  isPlaying,
  onTogglePlayback,
  currentTime,
  totalDuration,
  playbackSpeed,
  onSpeedChange,
  onScrub,
  metricsA,
  metricsB,
  activeVideoId,
  onSelectVideo,
  onAddVideoB,
  errorA,
  errorB,
  statusA = 'NONE',
  subStatusA,
  statusB = 'NONE',
  subStatusB
}: StagePaneProps) {
  const timelineRef = useRef<HTMLDivElement>(null);
  
  const [isAddingMode, setIsAddingMode] = useState(false);
  const [videoBUrl, setVideoBUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ingestError, setIngestError] = useState('');

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoBUrl || !onAddVideoB) return;
    setIsSubmitting(true);
    setIngestError('');
    try {
      await onAddVideoB(videoBUrl);
      setIsAddingMode(false);
      setVideoBUrl('');
    } catch (err: any) {
      setIngestError(err.message || 'Failed to ingest video');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const pct = x / rect.width;
    onScrub(pct * totalDuration);
  };

  const progressPct = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  return (
    <div className="flex-1 h-full flex flex-col bg-[#09090b] overflow-hidden min-w-0">
      
      {/* Top HUD & Player */}
      <div className="flex-1 p-4 flex flex-col items-center justify-center relative">
        <div className="absolute top-4 left-4 bg-[#18181c] border border-[#27272a] px-2 py-1 rounded text-xs font-mono text-[#10b981] flex items-center gap-2 shadow-lg">
          <div className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse" />
          AI SCAN ACTIVE
        </div>

        {monitorMode === 'single' && metricsB && (
          <div className="absolute top-4 right-4 bg-[#18181c] border border-[#27272a] rounded overflow-hidden flex shadow-lg z-30">
            <button 
              onClick={() => onSelectVideo('A')} 
              className={`px-3 py-1 text-[10px] font-mono tracking-wider transition-colors ${activeVideoId === 'A' ? 'bg-[#3b82f6] text-white' : 'text-[#94a3b8] hover:text-white hover:bg-[#27272a]'}`}
            >
              VIDEO A
            </button>
            <button 
              onClick={() => onSelectVideo('B')} 
              className={`px-3 py-1 text-[10px] font-mono tracking-wider transition-colors ${activeVideoId === 'B' ? 'bg-[#10b981] text-white' : 'text-[#94a3b8] hover:text-white hover:bg-[#27272a]'}`}
            >
              VIDEO B
            </button>
          </div>
        )}

        <div className="flex-1 w-full flex flex-row gap-2 sm:gap-4 min-h-0 lg:max-h-[50vh]">
          {(() => {
            const isFirstPlayerA = monitorMode === 'dual' || activeVideoId === 'A';
            const currentMetrics = isFirstPlayerA ? metricsA : (metricsB || metricsA);
            const currentLabel = isFirstPlayerA ? 'Video A' : 'Video B';
            const isActive = isFirstPlayerA ? activeVideoId === 'A' : activeVideoId === 'B';
            const activeColorClass = isFirstPlayerA ? 'border-[#3b82f6] shadow-[0_0_15px_rgba(59,130,246,0.15)]' : 'border-[#10b981] shadow-[0_0_15px_rgba(16,185,129,0.15)]';
            
            return (
              <div className={`flex-1 bg-black rounded-lg border relative overflow-hidden flex flex-col group cursor-pointer transition-colors ${isActive ? activeColorClass : 'border-[#27272a]'}`} onClick={() => { !isActive ? onSelectVideo(isFirstPlayerA ? 'A' : 'B') : onTogglePlayback(); }}>
                 {currentMetrics.thumbnailUrl ? (
                   <img src={currentMetrics.thumbnailUrl} alt={`${currentLabel} Thumbnail`} className="absolute inset-0 w-full h-full object-cover opacity-50 group-hover:opacity-40 transition-opacity" />
                 ) : (
                   <div className="absolute inset-0 bg-[#121215] opacity-50"></div>
                 )}
                 <div className="absolute bottom-2 right-2 bg-black/50 border border-white/10 backdrop-blur-md px-2 py-0.5 rounded-md text-[9px] sm:text-[10px] text-white/90 font-medium tracking-wide z-10 shadow-sm">{currentLabel}</div>
                 
                 {/* Error Overlay */}
                 {isFirstPlayerA && errorA && (
                   <div className="absolute inset-0 bg-[#f43f5e]/10 backdrop-blur-[2px] flex flex-col items-center justify-center p-4 z-30">
                     <div className="w-10 h-10 rounded-full bg-[#f43f5e]/20 border border-[#f43f5e]/50 flex items-center justify-center mb-2">
                       <svg className="w-5 h-5 text-[#f43f5e]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                     </div>
                     <span className="text-[#f43f5e] font-semibold text-xs text-center">{errorA}</span>
                   </div>
                 )}
                 {!isFirstPlayerA && errorB && (
                   <div className="absolute inset-0 bg-[#f43f5e]/10 backdrop-blur-[2px] flex flex-col items-center justify-center p-4 z-30">
                     <div className="w-10 h-10 rounded-full bg-[#f43f5e]/20 border border-[#f43f5e]/50 flex items-center justify-center mb-2">
                       <svg className="w-5 h-5 text-[#f43f5e]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                     </div>
                     <span className="text-[#f43f5e] font-semibold text-xs text-center">{errorB}</span>
                   </div>
                 )}
                 
                 {/* Processing Overlay */}
                 {isFirstPlayerA && ['PENDING', 'PROCESSING'].includes(statusA) && !errorA && (
                   <ProcessingOverlay status={statusA} subStatus={subStatusA || null} />
                 )}
                 {!isFirstPlayerA && ['PENDING', 'PROCESSING'].includes(statusB) && !errorB && (
                   <ProcessingOverlay status={statusB} subStatus={subStatusB || null} />
                 )}
                 
                 {/* Big Play/Pause Overlay */}
                 <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                    {isPlaying ? (
                      <svg className="w-16 h-16 text-white/80 drop-shadow-xl" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6zm8 0h4v16h-4z"/></svg>
                    ) : (
                      <svg className="w-16 h-16 text-white/80 drop-shadow-xl" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    )}
                 </div>
              </div>
            );
          })()}
          
          {monitorMode === 'dual' && (
            (metricsB || (statusB && statusB !== 'NONE')) ? (
              <div className={`flex-1 bg-black rounded-lg border relative overflow-hidden flex flex-col cursor-pointer group transition-colors ${activeVideoId === 'B' ? 'border-[#10b981] shadow-[0_0_15px_rgba(16,185,129,0.15)]' : 'border-[#27272a]'}`} onClick={() => { activeVideoId !== 'B' ? onSelectVideo('B') : onTogglePlayback(); }}>
                {/* Actual Video B Thumbnail */}
                {metricsB?.thumbnailUrl ? (
                  <img src={metricsB.thumbnailUrl} alt="Video B Thumbnail" className="absolute inset-0 w-full h-full object-cover opacity-50 group-hover:opacity-40 transition-opacity" />
                ) : (
                  <div className="absolute inset-0 bg-[#121215] opacity-50"></div>
                )}
                <div className="absolute bottom-2 right-2 bg-black/50 border border-white/10 backdrop-blur-md px-2 py-0.5 rounded-md text-[9px] sm:text-[10px] text-white/90 font-medium tracking-wide z-10 shadow-sm">Video B</div>
                
                {/* Error Overlay */}
                {errorB && (
                  <div className="absolute inset-0 bg-[#f43f5e]/10 backdrop-blur-[2px] flex flex-col items-center justify-center p-4 z-30">
                    <div className="w-10 h-10 rounded-full bg-[#f43f5e]/20 border border-[#f43f5e]/50 flex items-center justify-center mb-2">
                      <svg className="w-5 h-5 text-[#f43f5e]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    </div>
                    <span className="text-[#f43f5e] font-semibold text-xs text-center">{errorB}</span>
                  </div>
                )}

                {/* Processing Overlay */}
                {['PENDING', 'PROCESSING'].includes(statusB) && !errorB && (
                  <ProcessingOverlay status={statusB} subStatus={subStatusB || null} />
                )}

                {/* Big Play/Pause Overlay */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                   {isPlaying ? (
                     <svg className="w-16 h-16 text-white/80 drop-shadow-xl" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6zm8 0h4v16h-4z"/></svg>
                   ) : (
                     <svg className="w-16 h-16 text-white/80 drop-shadow-xl" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                   )}
                </div>
              </div>
            ) : (
              isAddingMode ? (
                <form onSubmit={handleAddSubmit} className="flex-1 bg-[#121215] border border-[#27272a] rounded-lg relative overflow-hidden flex flex-col items-center justify-center p-4">
                  <div className="text-[#10b981] font-mono text-sm mb-4">INGEST VIDEO B</div>
                  {ingestError && (
                    <div className="text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded px-3 py-2 mb-3 max-w-sm text-center">
                      {ingestError}
                    </div>
                  )}
                  <input 
                    type="url" 
                    placeholder="Paste Video URL..." 
                    value={videoBUrl}
                    onChange={e => {
                      setVideoBUrl(e.target.value);
                      if (ingestError) setIngestError('');
                    }}
                    disabled={isSubmitting}
                    className="w-full max-w-sm bg-[#09090b] text-sm text-white px-3 py-2 rounded border border-[#27272a] focus:outline-none focus:border-[#10b981] mb-3"
                    required
                  />
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setIsAddingMode(false)} disabled={isSubmitting} className="px-3 py-1.5 text-xs text-[#94a3b8] hover:text-white bg-[#18181c] rounded border border-[#27272a]">CANCEL</button>
                    <button type="submit" disabled={isSubmitting} className="px-3 py-1.5 text-xs text-white bg-[#10b981] hover:bg-[#059669] rounded disabled:opacity-50 flex items-center gap-2">
                      {isSubmitting && <div className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />}
                      ANALYZE
                    </button>
                  </div>
                </form>
              ) : (
                <div 
                  onClick={() => setIsAddingMode(true)}
                  className="flex-1 bg-[#121215] border-2 border-dashed border-[#27272a] hover:border-[#10b981]/50 hover:bg-[#10b981]/5 rounded-lg relative overflow-hidden flex flex-col items-center justify-center cursor-pointer group transition-colors min-h-[120px]"
                >
                  <div className="w-12 h-12 rounded-full bg-[#18181c] border border-[#27272a] group-hover:border-[#10b981]/50 flex items-center justify-center mb-3 transition-colors text-[#94a3b8] group-hover:text-[#10b981]">
                     <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                  </div>
                  <span className="text-[#10b981] font-mono text-sm z-10 tracking-wider">ADD VIDEO B</span>
                  <span className="text-[#94a3b8] text-xs mt-1">Paste URL to compare</span>
                </div>
              )
            )
          )}
        </div>
      </div>

      {/* Transport Bar */}
      <div className="border-t border-b border-[#27272a] bg-[#121215] flex flex-wrap items-center px-4 py-3 md:py-2 min-h-[3.5rem] justify-between shrink-0 gap-y-3 gap-x-6">
        
        {/* Play Controls & Timecode */}
        <div className="flex items-center justify-between sm:justify-start flex-1 min-w-[200px] gap-4 sm:gap-6">
          <div className="flex items-center gap-4">
            <button onClick={() => onScrub(Math.max(0, currentTime - 5))} className="text-[#94a3b8] hover:text-white">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z"/></svg>
            </button>
            <button onClick={onTogglePlayback} className="text-white hover:text-[#3b82f6] transition-colors">
              {isPlaying ? (
                 <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6zm8 0h4v16h-4z"/></svg>
              ) : (
                 <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              )}
            </button>
            <button onClick={() => onScrub(Math.min(totalDuration, currentTime + 5))} className="text-[#94a3b8] hover:text-white">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zM19.933 12.8a1 1 0 000-1.6l-5.334-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.333-4z"/></svg>
            </button>
          </div>
          
          <div className="font-mono text-sm md:text-lg text-white font-medium tracking-wider">
            {formatTimecode(currentTime)}
          </div>
        </div>
        
        {/* Speed Controls */}
        <div className="flex items-center gap-2 justify-center sm:justify-end w-full sm:w-auto">
           {[1.0, 1.25, 1.5, 2.0].map(speed => (
             <button 
                key={speed}
                onClick={() => onSpeedChange(speed)}
                className={`text-[10px] sm:text-xs font-mono px-3 py-1 rounded border transition-all ${playbackSpeed === speed ? 'bg-[#3b82f6]/20 border-[#3b82f6] text-[#3b82f6] shadow-[0_0_8px_rgba(59,130,246,0.2)]' : 'bg-[#18181c] border-[#27272a] text-[#94a3b8] hover:text-white hover:border-[#3b82f6]/50'}`}
             >
               {speed.toFixed(1)}x
             </button>
           ))}
        </div>
      </div>

      {/* Professional NLE Scrub Bar */}
      <div className="h-12 bg-[#121215] shrink-0 border-b border-[#27272a] flex flex-col justify-center px-4 select-none">
        
        {/* Scrub Track */}
        <div className="relative w-full h-8 flex items-center cursor-pointer group/scrubber"
             ref={timelineRef} 
             onPointerDown={(e) => {
               handleTimelineClick(e);
               (e.target as HTMLElement).setPointerCapture(e.pointerId);
             }} 
             onPointerMove={(e) => {
               if (e.buttons === 1) handleTimelineClick(e);
             }}
        >
           {/* Track Background */}
           <div className="w-full h-3 bg-[#18181c] border border-[#27272a] rounded overflow-hidden relative shadow-inner transition-colors group-hover/scrubber:border-white/10">
              {/* Progress Fill */}
              <div className="absolute top-0 bottom-0 left-0 bg-[#3b82f6]/80 border-r border-[#60a5fa] transition-all duration-75 pointer-events-none" style={{ width: `${progressPct}%` }}></div>
           </div>
           
           {/* Stick Playhead */}
           <div className="absolute top-1/2 w-[2px] h-8 bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)] z-50 pointer-events-none opacity-50 group-hover/scrubber:opacity-100 transition-opacity duration-150" style={{ left: `${progressPct}%`, transform: 'translate(-50%, -50%)' }}>
              {/* Playhead Cap */}
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-red-500 rounded-[1px]"></div>
           </div>
        </div>
      </div>

      {/* Dense Signal Cards Deck */}
      <div className="flex-1 p-4 overflow-y-auto bg-[#09090b]">
         <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Signals & Metrics <span className={activeVideoId === 'A' ? 'text-[#3b82f6]' : 'text-[#10b981]'}>[VIDEO {activeVideoId}]</span></h3>
         </div>

         <div className="flex flex-wrap gap-4">
            
            {/* Views */}
            <div className="flex-1 min-w-[130px] bg-[#121215] border border-[#27272a] rounded-lg p-3 hover:border-[#3b82f6] transition-colors">
               <div className="text-[10px] text-[#94a3b8] font-semibold tracking-wider mb-2 uppercase">Total Views</div>
               <div className="flex items-end gap-2">
                  <span className="text-xl lg:text-3xl font-mono text-white">{(activeVideoId === 'A' ? metricsA : metricsB || metricsA).views.toLocaleString()}</span>
               </div>
            </div>

            {/* Engagement Rate */}
            <div className="flex-1 min-w-[130px] bg-[#121215] border border-[#27272a] rounded-lg p-3 hover:border-[#3b82f6] transition-colors">
               <div className="text-[10px] text-[#94a3b8] font-semibold tracking-wider mb-2 uppercase">Engagement Rate</div>
               <div className="flex items-end gap-2">
                  <span className="text-xl lg:text-3xl font-mono text-white">{(activeVideoId === 'A' ? metricsA : metricsB || metricsA).engagementRate.toFixed(2)}%</span>
               </div>
               <div className="text-[9px] lg:text-xs text-[#10b981] mt-1">Calculated Metric</div>
            </div>

            {/* Likes */}
            <div className="flex-1 min-w-[130px] bg-[#121215] border border-[#27272a] rounded-lg p-3 hover:border-[#3b82f6] transition-colors">
               <div className="text-[10px] text-[#94a3b8] font-semibold tracking-wider mb-2 uppercase">Likes</div>
               <div className="flex items-end gap-2">
                  <span className="text-xl lg:text-3xl font-mono text-white">{(activeVideoId === 'A' ? metricsA : metricsB || metricsA).likes.toLocaleString()}</span>
               </div>
            </div>

            {/* Comments */}
            <div className="flex-1 min-w-[130px] bg-[#121215] border border-[#27272a] rounded-lg p-3 hover:border-[#3b82f6] transition-colors">
               <div className="text-[10px] text-[#94a3b8] font-semibold tracking-wider mb-2 uppercase">Comments</div>
               <div className="flex items-center gap-2 mt-1">
                  <span className="text-xl lg:text-3xl font-mono text-white">{(activeVideoId === 'A' ? metricsA : metricsB || metricsA).comments.toLocaleString()}</span>
               </div>
            </div>

         </div>
      </div>
    </div>
  );
}
