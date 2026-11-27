import { Check } from 'lucide-react';

const STEPS = [
  { number: 1, label: 'Cargar archivo' },
  { number: 2, label: 'Seleccionar columnas' },
  { number: 3, label: 'Previsualizar datos' },
  { number: 4, label: 'Dashboard' },
];

export function Stepper({ currentStep }) {
  return (
    <nav aria-label="Progreso del análisis" className="max-w-3xl w-full mx-auto py-8 px-6">
      <div className="flex items-start justify-between">
        {STEPS.map((step, index) => {
          const isCompleted = step.number < currentStep;
          const isActive = step.number === currentStep;
          const isLast = index === STEPS.length - 1;

          return (
            <div
              key={step.number}
              className={`flex items-start ${isLast ? 'shrink-0' : 'flex-1'}`}
            >
              <div className="flex flex-col items-center shrink-0">
                {isCompleted ? (
                  <div className="w-8 h-8 rounded-full bg-[#1d5b90] text-white flex items-center justify-center shadow-sm">
                    <Check className="w-4 h-4" strokeWidth={2.5} />
                  </div>
                ) : isActive ? (
                  <div className="w-8 h-8 rounded-full bg-[#1d5b90] text-white font-semibold text-sm flex items-center justify-center shadow-sm">
                    {step.number}
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-full bg-white border border-[#c9dceb] text-[#56748d] font-medium text-sm flex items-center justify-center">
                    {step.number}
                  </div>
                )}

                <span
                  className={`mt-2 text-xs text-center whitespace-nowrap ${
                    isActive
                      ? 'text-[#1d5b90] font-semibold'
                      : 'text-[#56748d] font-medium'
                  }`}
                >
                  {step.label}
                </span>
              </div>

              {!isLast && (
                <div className="flex-1 px-3 pt-4">
                  <div
                    className={`h-[2px] w-full rounded-full transition-colors ${
                      isCompleted ? 'bg-[#1d5b90]' : 'bg-[#d8e7f3]'
                    }`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
