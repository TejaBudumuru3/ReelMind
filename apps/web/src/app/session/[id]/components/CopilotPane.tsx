'use client';

import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { ChatMessage } from '../types';

interface CopilotPaneProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  onSendMessage: (msg: string) => void;
  onTimecodeClick: (seconds: number) => void;
  modelName?: string;
  isCompare?: boolean;
}

function parseMessageContent(text: string) {
  // Extract <think> block
  const thinkMatch = text.match(/<think>([\s\S]*?)(?:<\/think>|$)/);
  const thinkContent = thinkMatch ? thinkMatch[1].trim() : null;
  
  // The rest is the actual message
  const cleanText = text.replace(/<think>[\s\S]*?(?:<\/think>|$)/, '').trim();

  return { thinkContent, cleanText };
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text', err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1.5 text-[#94a3b8] hover:text-white hover:bg-[#27272a] rounded transition-colors absolute top-2 right-2"
      title="Copy message"
    >
      {copied ? (
        <svg className="w-3.5 h-3.5 text-[#10b981]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
      ) : (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
      )}
    </button>
  );
}

export default function CopilotPane({
  messages,
  isStreaming,
  onSendMessage,
  onTimecodeClick,
  modelName = "Qwen 3.6 27b Reasoning",
  isCompare = false
}: CopilotPaneProps) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Handle scroll events to determine if user has scrolled up
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    // If we are within 50px of the bottom, turn autoScroll back on
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isAtBottom);
  };

  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isStreaming, autoScroll]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    onSendMessage(input.trim());
    setInput('');
  };

  const presetChips = isCompare ? ["Hook Compare", "Retention", "Highlights"] : ["Key Highlights", "Analyze Retention", "Summarize"];

  return (
    <div className="w-full h-full flex flex-col bg-[#121215] border-l border-[#27272a] overflow-hidden relative">
      {/* Header */}
      <div className="p-3 border-b border-[#27272a] flex items-center justify-between shrink-0 bg-[#09090b]">
        <h3 className="text-sm font-semibold text-white tracking-wide">AI COPILOT</h3>
        <div className="px-2 py-0.5 rounded-full border border-[#27272a] bg-[#18181c] text-[10px] text-[#10b981] font-mono tracking-wider flex items-center gap-1.5 shadow-inner">
          <div className="w-1.5 h-1.5 rounded-full bg-[#10b981]"></div>
          {modelName}
        </div>
      </div>

      {/* Preset Chips */}
      <div className="flex gap-2 p-3 overflow-x-auto shrink-0 scrollbar-hide border-b border-[#27272a] bg-[#121215]">
        {presetChips.map(chip => (
          <button 
            key={chip}
            onClick={() => onSendMessage(chip)}
            disabled={isStreaming}
            className="whitespace-nowrap px-3 py-1.5 rounded-full border border-[#27272a] bg-[#18181c] text-xs text-[#94a3b8] hover:text-white hover:border-[#3b82f6] transition-colors disabled:opacity-50"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Messages Thread */}
      <div 
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-50">
             <svg className="w-12 h-12 text-[#94a3b8] mb-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.792 0-5.484-.377-8.035-1.087-1.717-.293-2.3-2.379-1.067-3.61L5 14.5" /></svg>
             <p className="text-sm text-[#94a3b8]">Ask anything about your timeline,<br/>pacing, or content hooks.</p>
          </div>
        ) : (
          messages.map(msg => {
            const { thinkContent, cleanText } = parseMessageContent(msg.text);
            const isAI = msg.sender === 'ai';

            return (
              <div key={msg.id} className={`flex flex-col ${isAI ? 'items-start' : 'items-end'}`}>
                <div className={`relative max-w-[85%] rounded-lg p-4 ${isAI ? 'bg-[#18181c] border border-[#27272a] text-neutral-200' : 'bg-[#3b82f6] text-white'}`}>
                  {isAI && <CopyButton text={cleanText} />}
                  
                  {isAI && thinkContent && (
                    <details className="mb-2 group">
                      <summary className="text-xs text-[#94a3b8] font-medium cursor-pointer flex items-center gap-1 select-none hover:text-white transition-colors">
                        <svg className="w-3 h-3 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                        Thinking Process
                      </summary>
                      <div className="mt-2 text-xs font-mono text-[#94a3b8] p-2 bg-[#09090b] rounded border border-[#27272a] whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                        {thinkContent}
                      </div>
                    </details>
                  )}

                  <div className="text-sm prose prose-invert prose-p:leading-snug prose-li:my-0 prose-ul:my-2 prose-headings:mb-2 prose-headings:mt-4 max-w-none whitespace-pre-wrap">
                     <ReactMarkdown>{cleanText}</ReactMarkdown>
                  </div>

                  {msg.actionableTimecodes && msg.actionableTimecodes.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                       {msg.actionableTimecodes.map((tc, idx) => (
                         <button 
                           key={idx}
                           onClick={() => onTimecodeClick(tc.seconds)}
                           className="text-[10px] font-mono px-2 py-1 rounded bg-[#3b82f6]/20 text-[#3b82f6] hover:bg-[#3b82f6] hover:text-white transition-colors flex items-center gap-1 border border-[#3b82f6]/30"
                         >
                           <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                           Jump {tc.label}
                         </button>
                       ))}
                    </div>
                  )}

                </div>
                <span className="text-[10px] text-[#94a3b8] mt-1 px-1">{msg.timestamp}</span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-[#27272a] bg-[#18181c] shrink-0">
         <div className="relative">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={isStreaming ? "AI is generating..." : "Ask Copilot..."}
              disabled={isStreaming}
              className="w-full bg-[#09090b] text-sm text-white px-4 py-3 pr-12 rounded-lg border border-[#27272a] focus:outline-none focus:border-[#3b82f6] transition-colors disabled:opacity-50"
            />
            <button 
              type="submit"
              disabled={!input.trim() || isStreaming}
              className="absolute right-2 top-2 bottom-2 aspect-square bg-[#3b82f6] hover:bg-[#2563eb] disabled:bg-[#27272a] text-white rounded flex items-center justify-center transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
            </button>
         </div>
      </form>
    </div>
  );
}
