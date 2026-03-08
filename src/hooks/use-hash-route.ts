import { useSyncExternalStore } from "react";

function getHash() {
  return window.location.hash.replace(/^#/, "") || "/";
}

function subscribe(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

export function useHashRoute() {
  return useSyncExternalStore(subscribe, getHash, () => "/");
}

export function navigate(path: string) {
  window.location.hash = path;
}
