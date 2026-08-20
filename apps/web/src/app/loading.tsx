import React from 'react';

export default function Loading() {
  return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center p-4">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-full border-2 border-[#27272a] border-t-[#3b82f6] animate-spin"></div>
        <span className="text-[#94a3b8] font-mono text-sm tracking-widest animate-pulse">LOADING...</span>
      </div>
    </div>
  );
}
