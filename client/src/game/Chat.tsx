import { useEffect, useRef, useState } from 'react';
import type { ChatEntry } from '@kuhhandel/shared';
import { useSocket } from '../socket';

function AudioMessage({ audio }: { audio: ArrayBuffer }) {
  const urlRef = useRef('');
  if (!urlRef.current) {
    urlRef.current = URL.createObjectURL(new Blob([audio]));
  }
  useEffect(() => () => URL.revokeObjectURL(urlRef.current), []);
  return (
    <audio
      controls
      src={urlRef.current}
      preload="metadata"
      className="h-8 w-full rounded"
    />
  );
}

function MessageBubble({ msg }: { msg: ChatEntry }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-semibold text-brass-400">{msg.from}</p>
      {msg.kind === 'text' ? (
        <p className="break-words rounded-lg bg-felt-800 px-2.5 py-1.5 text-sm text-parchment">
          {msg.text}
        </p>
      ) : (
        <div className="rounded-lg bg-felt-800 px-2 py-1.5">
          <AudioMessage audio={msg.audio} />
        </div>
      )}
    </div>
  );
}

export function Chat() {
  const { chatMessages, sendChatMessage, sendChatAudio } = useSocket();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);
  const [unread, setUnread] = useState(0);
  const lastSeenRef = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const mrRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (open) {
      lastSeenRef.current = chatMessages.length;
      setUnread(0);
    } else {
      setUnread(chatMessages.length - lastSeenRef.current);
    }
  }, [chatMessages.length, open]);

  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [chatMessages, open]);

  const send = () => {
    const t = text.trim().slice(0, 300);
    if (!t) return;
    sendChatMessage(t);
    setText('');
  };

  const startRec = async () => {
    if (recording) return;
    cancelRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (ev) => ev.data.size > 0 && chunksRef.current.push(ev.data);
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (!cancelRef.current && chunksRef.current.length > 0) {
          const blob = new Blob(chunksRef.current, { type: mr.mimeType });
          blob.arrayBuffer().then((buf) => sendChatAudio(buf));
        }
        chunksRef.current = [];
        setRecording(false);
      };
      mr.start();
      mrRef.current = mr;
      setRecording(true);
      // Auto-stop après 10 s max
      setTimeout(() => {
        if (mrRef.current?.state === 'recording') mrRef.current.stop();
      }, 10_000);
    } catch {
      setRecording(false);
    }
  };

  const stopRec = () => {
    cancelRef.current = false;
    if (mrRef.current?.state === 'recording') mrRef.current.stop();
    mrRef.current = null;
  };

  const cancelRec = () => {
    cancelRef.current = true;
    if (mrRef.current?.state === 'recording') mrRef.current.stop();
    mrRef.current = null;
  };

  const canRecord =
    typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  return (
    <>
      {open && (
        <div className="fixed bottom-16 right-3 z-50 flex h-[min(420px,70svh)] w-72 max-w-[calc(100vw-1.5rem)] flex-col rounded-xl bg-felt-900 shadow-2xl ring-1 ring-parchment/15 sm:w-80">
          <div className="flex items-center justify-between border-b border-parchment/10 px-3 py-2">
            <span className="font-display text-sm font-semibold text-parchment">Chat</span>
            <button
              onClick={() => setOpen(false)}
              className="text-lg leading-none text-parchment/50 hover:text-parchment"
            >
              ✕
            </button>
          </div>

          <div ref={listRef} className="flex-1 space-y-2.5 overflow-y-auto p-3 [user-select:text]">
            {chatMessages.length === 0 && (
              <p className="pt-6 text-center text-xs text-parchment/40">
                Aucun message pour l'instant…
              </p>
            )}
            {chatMessages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} />
            ))}
          </div>

          {recording ? (
            /* Barre d'enregistrement : remplace la saisie pendant l'enregistrement */
            <div className="flex items-center gap-2 border-t border-parchment/10 px-2 py-2">
              <div className="flex flex-1 items-center gap-2 rounded-lg bg-red-950/60 px-3 py-2">
                <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-red-500" />
                <span className="text-sm text-parchment/80">Enregistrement…</span>
              </div>
              <button
                onClick={cancelRec}
                className="shrink-0 rounded-lg bg-felt-700 px-2.5 py-2 text-xs text-parchment/70 hover:bg-felt-600"
              >
                Annuler
              </button>
              <button
                onClick={stopRec}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-500 text-sm font-bold text-white hover:bg-red-600"
                aria-label="Envoyer le message vocal"
                title="Envoyer"
              >
                ■
              </button>
            </div>
          ) : (
            /* Barre de saisie normale */
            <div className="flex items-center gap-1.5 border-t border-parchment/10 px-2 py-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
                placeholder="Message…"
                maxLength={300}
                className="min-w-0 flex-1 rounded-lg bg-felt-800 px-3 py-1.5 text-sm text-parchment outline-none placeholder:text-parchment/30 [user-select:text]"
              />
              <button
                onClick={send}
                disabled={!text.trim()}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brass-500 text-base font-bold text-felt-900 disabled:opacity-40"
                aria-label="Envoyer"
              >
                ↑
              </button>
              {canRecord && (
                <button
                  onClick={startRec}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-felt-700 text-base text-parchment hover:bg-felt-600"
                  aria-label="Message vocal"
                  title="Appuyer pour enregistrer"
                >
                  🎙
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-3 right-3 z-50 relative flex h-12 w-12 items-center justify-center rounded-full bg-felt-700 shadow-lg ring-1 ring-parchment/20 transition-colors hover:bg-felt-600 active:scale-95"
        aria-label={open ? 'Fermer le chat' : 'Ouvrir le chat'}
      >
        <span className="text-xl">💬</span>
        {unread > 0 && !open && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brass-500 px-1 text-xs font-bold text-felt-900">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
    </>
  );
}
