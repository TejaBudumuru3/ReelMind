'use client';

import React from 'react';
import { TranscriptLine, VideoItem } from '../types';

interface InspectorPaneProps {
  currentTab: 'transcript' | 'queue';
  onTabChange: (tab: 'transcript' | 'queue') => void;
  transcript: TranscriptLine[];
  queue: VideoItem[];
  currentTime: number;
  onSeek: (seconds: number) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export default function InspectorPane({
  currentTab,
  onTabChange,
  transcript,
  queue,
  currentTime,
  onSeek,
  searchQuery,
  onSearchChange,
}: InspectorPaneProps) {
  
  const filteredTranscript = transcript.filter(line => 
    line.text.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="w-full h-full flex flex-col bg-[#121215] border-r border-[#27272a] overflow-hidden">
      {/* Header Tabs */}
      <div className="flex border-b border-[#27272a]">
        <button
          className={`flex-1 py-3 text-xs font-semibold tracking-wider ${
            currentTab === 'transcript' ? 'text-white border-b-2 border-[#3b82f6]' : 'text-[#94a3b8] hover:text-white'
          }`}
          onClick={() => onTabChange('transcript')}
        >
          TRANSCRIPT
        </button>
        <button
          className={`flex-1 py-3 text-xs font-semibold tracking-wider ${
            currentTab === 'queue' ? 'text-white border-b-2 border-[#3b82f6]' : 'text-[#94a3b8] hover:text-white'
          }`}
          onClick={() => onTabChange('queue')}
        >
          QUEUE
        </button>
      </div>

      {currentTab === 'transcript' && (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Search Bar */}
          <div className="p-3 border-b border-[#27272a]">
            <input
              type="text"
              placeholder="Search transcript..."
              className="w-full bg-[#18181c] text-sm text-white px-3 py-2 rounded border border-[#27272a] focus:outline-none focus:border-[#3b82f6]"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
          
          {/* Transcript List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {transcript.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-6 text-center select-none">
                <div className="w-10 h-10 rounded-xl bg-[#18181c] border border-[#27272a] flex items-center justify-center mb-3 text-zinc-400">
                  <svg className="w-5 h-5 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </div>
                <div className="text-xs font-semibold text-white mb-1">Direct Download Session</div>
                <p className="text-[11px] text-zinc-400 max-w-[200px] leading-relaxed">
                  Transcription & AI signals were bypassed to allow unrestricted video length.
                </p>
              </div>
            ) : filteredTranscript.length === 0 ? (
              <div className="p-4 text-center text-xs text-zinc-500 font-mono">
                No matching transcript lines found.
              </div>
            ) : (
              filteredTranscript.map((line) => {
              const isActive = currentTime >= line.seconds && currentTime < line.seconds + 5; // Rough active guess
              return (
                <div
                  key={line.id}
                  onClick={() => onSeek(line.seconds)}
                  className={`p-2 rounded cursor-pointer transition-colors ${
                    isActive ? 'bg-[#3b82f6]/20 border border-[#3b82f6]/50' : 'hover:bg-[#18181c] border border-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono text-[#3b82f6]">{line.timecode}</span>
                    {line.type && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-sm uppercase tracking-wider ${
                        line.type === 'hook' ? 'bg-[#3b82f6]/20 text-[#3b82f6]' :
                        line.type === 'peak' ? 'bg-[#10b981]/20 text-[#10b981]' :
                        'bg-[#f59e0b]/20 text-[#f59e0b]'
                      }`}>
                        {line.type}
                      </span>
                    )}
                  </div>
                  <p className={`text-sm leading-snug ${isActive ? 'text-white' : 'text-neutral-300'}`}>
                    {line.text}
                  </p>
                </div>
              );
            }))}
          </div>
        </div>
      )}

      {currentTab === 'queue' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {queue.map(video => (
            <div key={video.id} className="bg-[#18181c] border border-[#27272a] rounded overflow-hidden cursor-pointer hover:border-[#3b82f6] transition-colors">
              <div className="h-32 bg-[#27272a] relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={video.thumbnailUrl} alt={video.title} className="w-full h-full object-cover" />
                <div className="absolute bottom-1 right-1 bg-black/80 px-1.5 rounded text-xs font-mono text-white">
                  {Math.floor(video.durationSeconds / 60)}:{(video.durationSeconds % 60).toString().padStart(2, '0')}
                </div>
              </div>
              <div className="p-3">
                <h4 className="text-sm font-medium text-white line-clamp-2 leading-snug mb-1">{video.title}</h4>
                <div className="flex items-center justify-between text-xs text-[#94a3b8]">
                  <span>{video.channel}</span>
                  <span>{video.views}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
