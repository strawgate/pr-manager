import { create } from "zustand";

type SettingsState = {
  githubToken: string;
  openrouterApiKey: string;
  resultLimit: number;
  setGithubToken: (value: string) => void;
  setOpenrouterApiKey: (value: string) => void;
  setResultLimit: (value: number) => void;
  clearSecrets: () => void;
};

const STORAGE_KEY = "pr-manager.settings.v1";

function readStored(): Pick<
  SettingsState,
  "githubToken" | "openrouterApiKey" | "resultLimit"
> {
  if (typeof window === "undefined") {
    return { githubToken: "", openrouterApiKey: "", resultLimit: 30 };
  }

  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return { githubToken: "", openrouterApiKey: "", resultLimit: 30 };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<{
      githubToken: string;
      openrouterApiKey: string;
      anthropicKey: string;
      resultLimit: number;
    }>;
    return {
      githubToken: parsed.githubToken ?? "",
      // Backward-compatible migration from old key name.
      openrouterApiKey: parsed.openrouterApiKey ?? parsed.anthropicKey ?? "",
      resultLimit: parsed.resultLimit ?? 30,
    };
  } catch {
    return { githubToken: "", openrouterApiKey: "", resultLimit: 30 };
  }
}

function persist(
  value: Pick<SettingsState, "githubToken" | "openrouterApiKey" | "resultLimit">,
) {
  if (typeof window === "undefined") {
    return;
  }
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

const initial = readStored();

export const useSettingsStore = create<SettingsState>((set, get) => ({
  githubToken: initial.githubToken,
  openrouterApiKey: initial.openrouterApiKey,
  resultLimit: initial.resultLimit,
  setGithubToken: (value) =>
    set((state) => {
      const next = { ...state, githubToken: value };
      persist(next);
      return next;
    }),
  setOpenrouterApiKey: (value) =>
    set((state) => {
      const next = { ...state, openrouterApiKey: value };
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
      const next = { ...state, githubToken: "", openrouterApiKey: "" };
      persist(next);
      return next;
    }),
}));
