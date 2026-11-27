import { Header } from './Header';
import { Stepper } from './Stepper';

export function MainLayout({ currentStep, children }) {
  const showStepper = currentStep >= 1 && currentStep <= 3;

  return (
    <div className="min-h-screen bg-[#edf5fb] flex flex-col">
      <Header />
      {showStepper && <Stepper currentStep={currentStep} />}
      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  );
}
