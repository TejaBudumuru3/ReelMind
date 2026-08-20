'use client';

import { useEffect } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import Link from 'next/link';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-[#121215] border border-[#27272a] rounded-xl p-8 flex flex-col items-center text-center shadow-2xl">
        <div className="w-16 h-16 rounded-full bg-[#f43f5e]/10 flex items-center justify-center mb-6">
          <AlertCircle className="w-8 h-8 text-[#f43f5e]" />
        </div>
        <h2 className="text-2xl font-display font-bold text-white mb-2">Something went wrong</h2>
        <p className="text-[#94a3b8] text-sm mb-8">
          A critical error occurred in the application. Don't worry, your data is safe.
        </p>
        <div className="flex flex-col w-full gap-3">
          <button
            onClick={() => reset()}
            className="w-full bg-[#3b82f6] hover:bg-[#2563eb] text-white font-medium py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
          >
            <RefreshCw size={16} /> Try Again
          </button>
          <Link
            href="/"
            className="w-full bg-[#18181c] border border-[#27272a] hover:bg-[#27272a] text-white font-medium py-3 rounded-lg flex items-center justify-center transition-colors"
          >
            Return to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
