import Link from 'next/link';
import { Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#09090b] flex flex-col items-center justify-center p-4">
      <div className="text-center space-y-6 max-w-md">
        <h1 className="text-[120px] font-display font-black leading-none text-transparent bg-clip-text bg-gradient-to-br from-[#3b82f6] to-[#c084fc] drop-shadow-lg opacity-80">
          404
        </h1>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-white tracking-tight">Workspace Not Found</h2>
          <p className="text-[#94a3b8]">
            The analysis session or page you're looking for doesn't exist, has expired, or you don't have access to it.
          </p>
        </div>
        <Link 
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 bg-[#18181c] hover:bg-[#27272a] border border-[#27272a] hover:border-[#3b82f6]/50 rounded-lg text-white font-medium transition-all group mt-4"
        >
          <Home size={18} className="text-[#94a3b8] group-hover:text-[#3b82f6] transition-colors" />
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}
