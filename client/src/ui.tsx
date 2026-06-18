import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANT: Record<Variant, string> = {
  primary:
    'bg-brass-500 hover:bg-brass-600 text-felt-900 font-semibold shadow-md disabled:bg-stone-400',
  secondary:
    'bg-felt-600 hover:bg-felt-700 text-parchment shadow disabled:bg-felt-800/60',
  ghost: 'bg-transparent hover:bg-white/10 text-parchment border border-parchment/30',
  danger: 'bg-red-600 hover:bg-red-700 text-white shadow disabled:bg-red-900/50',
};

export function Button({
  variant = 'primary',
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`rounded-xl px-4 py-2.5 transition-colors disabled:cursor-not-allowed disabled:opacity-70 active:scale-[0.98] ${VARIANT[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-felt-900/70 ring-1 ring-parchment/10 backdrop-blur ${className}`}>
      {children}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="h-5 w-5 animate-spin rounded-full border-2 border-parchment/30 border-t-parchment" />
  );
}
