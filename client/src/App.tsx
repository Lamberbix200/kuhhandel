import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useSocket } from './socket';
import { PseudoGate } from './screens/PseudoGate';
import { Home } from './screens/Home';
import { Room } from './screens/Room';

function ErrorToast() {
  const { error, clearError } = useSocket();
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(clearError, 4000);
    return () => clearTimeout(t);
  }, [error, clearError]);

  if (!error) return null;
  return (
    <div className="fixed inset-x-0 top-3 z-50 flex justify-center px-3">
      <button
        onClick={clearError}
        className="max-w-md rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-lg"
      >
        ⚠️ {error}
      </button>
    </div>
  );
}

export function App() {
  const { pseudo } = useSocket();

  return (
    <div className="min-h-full bg-gradient-to-b from-felt-700 to-felt-900 text-parchment">
      <ErrorToast />
      {pseudo ? (
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/room/:code" element={<Room />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      ) : (
        <PseudoGate />
      )}
    </div>
  );
}
