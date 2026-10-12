const SESSION_EXPIRED_EVENT = "drone-session-expired";

export function notifySessionExpired(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }
}

export function checkSessionResponse(response: Response): void {
  if (response.status === 401) {
    notifySessionExpired();
    throw new Error("Your session has expired. Please log in again.");
  }
}

export function onSessionExpired(handler: () => void): () => void {
  window.addEventListener(SESSION_EXPIRED_EVENT, handler);

  // Return cleanup so React can remove the listener on unmount.
  return () => {
    window.removeEventListener(SESSION_EXPIRED_EVENT, handler);
  };
}