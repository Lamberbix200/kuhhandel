// Identité invité persistée localement. Le guestId stable permet au serveur
// de retrouver le joueur lors d'une reconnexion. Sera complété par l'auth compte.

const GUEST_KEY = 'kh_guest_id';
const NAME_KEY = 'kh_pseudo';

export function getGuestId(): string {
  let id = localStorage.getItem(GUEST_KEY);
  if (!id) {
    id = `g_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
    localStorage.setItem(GUEST_KEY, id);
  }
  return id;
}

export function getStoredPseudo(): string {
  return localStorage.getItem(NAME_KEY) ?? '';
}

export function storePseudo(name: string): void {
  localStorage.setItem(NAME_KEY, name.trim().slice(0, 20));
}
