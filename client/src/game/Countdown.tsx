import { useEffect, useRef, useState } from 'react';
import { tick, tickUrgent } from '../sound';

/**
 * Compte à rebours d'enchère : anneau qui se vide + gros chiffre pulsé, avec
 * tic-tac sonore (plus pressant sur les 3 dernières secondes). Piloté par
 * l'horodatage de fin envoyé par le serveur ; chaque mise le réinitialise.
 */
export function Countdown({ endsAt, durationMs = 5000 }: { endsAt: number; durationMs?: number }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, endsAt - Date.now()));
  const lastSecRef = useRef(Math.ceil(Math.max(0, endsAt - Date.now()) / 1000));

  useEffect(() => {
    let raf = 0;
    lastSecRef.current = Math.ceil(Math.max(0, endsAt - Date.now()) / 1000);
    const loop = (): void => {
      const rem = Math.max(0, endsAt - Date.now());
      setRemaining(rem);
      const sec = Math.ceil(rem / 1000);
      if (sec < lastSecRef.current && sec > 0) {
        if (sec <= 3) tickUrgent();
        else tick();
      }
      lastSecRef.current = sec;
      if (rem > 0) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [endsAt]);

  const secs = Math.ceil(remaining / 1000);
  const frac = Math.max(0, Math.min(1, remaining / durationMs));
  const R = 34;
  const CIRC = 2 * Math.PI * R;
  const color = secs <= 1 ? '#dc2626' : secs <= 3 ? '#d9a441' : '#2a9d5a';
  const urgent = secs <= 3;

  return (
    <div className={`relative h-24 w-24 ${urgent ? 'kh-shake' : ''}`}>
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
        <circle cx="40" cy="40" r={R} fill="none" stroke="#0f3d24" strokeWidth="7" />
        <circle
          cx="40"
          cy="40"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={CIRC * (1 - frac)}
          style={{ transition: 'stroke-dashoffset 0.1s linear, stroke 0.3s' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span key={secs} className="kh-pop font-display text-4xl font-extrabold" style={{ color }}>
          {secs}
        </span>
      </div>
    </div>
  );
}
