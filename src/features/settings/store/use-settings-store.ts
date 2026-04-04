import { create } from "zustand";

type SettingsState = {
  githubToken: string;
  resultLimit: number;
  setGithubToken: (value: string) => void;
  setResultLimit: (value: number) => void;
  clearSecrets: () => void;
};

const STORAGE_KEY = "pr-manager.settings.v1";

function readStored(): Pick<SettingsState, "githubToken" | "resultLimit"> {
  if (typeof window === "undefined") {
    return { githubToken: "", resultLimit: 30 };
  }

  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return { githubToken: "", resultLimit: 30 };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<{
      githubToken: string;
      resultLimit: number;
    }>;
    return {
      githubToken: parsed.githubToken ?? "",
      resultLimit: parsed.resultLimit ?? 30,
    };
  } catch {
    return { githubToken: "", resultLimit: 30 };
  }
}

function persist(value: Pick<SettingsState, "githubToken" | "resultLimit">) {
  if (typeof window === "undefined") {
    return;
  }
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

const initial = readStored();

export const useSettingsStore = create<SettingsState>((set) => ({
  githubToken: initial.githubToken,
  resultLimit: initial.resultLimit,
  setGithubToken: (value) =>
    set((state) => {
      const next = { ...state, githubToken: value };
      persist(next);
      return next;
    }),
  setResultLimit: (value) =>
    set((state) => {
      const next = { ...state, resultLimit: value };
      persist(next);
      return next;
    }),
  clearSecrets: () =>
    set((state) => {
      const next = { ...state, githubToken: "" };
      persist(next);
      return next;
    }),
}));
