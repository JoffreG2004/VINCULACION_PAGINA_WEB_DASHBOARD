import { Cross, Lock } from 'lucide-react';

export function Header() {
  return (
    <header className="h-16 bg-[#f5f9fd] border-b border-[#cfe0ed] sticky top-0 z-30 px-6">
      <div className="h-full max-w-[1440px] mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#e6f0fa] border border-[#c9dceb] flex items-center justify-center">
            <Cross className="w-4 h-4 text-[#1d5b90]" strokeWidth={2.2} />
          </div>
          <span className="text-[#10263c] font-semibold text-base tracking-tight">
            Análisis de Datos Médicos
          </span>
        </div>

        <div className="flex items-center gap-2 text-sm text-[#56748d]">
          <Lock className="w-4 h-4 text-[#56748d]" strokeWidth={1.8} />
          <span>Entorno seguro</span>
        </div>
      </div>
    </header>
  );
}
