import { useSettingsStore } from "@/features/settings/store/use-settings-store";

const GITHUB_PAT_TEMPLATE_URL =
  "https://github.com/settings/personal-access-tokens/new?name=PR+Manager&description=Token+for+PR+Manager+dashboard+%28PR+dashboard+and+comment+actions%29&expires_in=30&pull_requests=write&contents=read&statuses=read&issues=write";

export function SettingsPanel() {
  const {
    githubToken,
    openrouterApiKey,
    resultLimit,
    setGithubToken,
    setOpenrouterApiKey,
    setResultLimit,
    clearSecrets,
  } = useSettingsStore();

  return (
    <section className="panel">
      <h2>Settings (BYOK)</h2>
      <p className="muted">
        Keys stay in your browser session storage and are never sent to a proxy.
      </p>

      <label>
        GitHub fine-grained PAT
        <input
          type="password"
          placeholder="github_pat_..."
          value={githubToken}
          onChange={(event) => setGithubToken(event.target.value.trim())}
        />
      </label>
      <p className="muted">
        <a href={GITHUB_PAT_TEMPLATE_URL} target="_blank" rel="noreferrer">
          Create a GitHub token with prefilled permissions
        </a>{" "}
        (select the correct resource owner and all repos you want to see).
      </p>

      <label>
        OpenRouter API key (for Vercel AI SDK actions)
        <input
          type="password"
          placeholder="sk-or-..."
          value={openrouterApiKey}
          onChange={(event) => setOpenrouterApiKey(event.target.value.trim())}
        />
      </label>

      <label>
        PRs per bucket query
        <input
          type="number"
          min={5}
          max={100}
          value={resultLimit}
          onChange={(event) =>
            setResultLimit(Math.min(100, Math.max(5, Number(event.target.value) || 30)))
          }
        />
      </label>

      <button type="button" className="button-secondary" onClick={clearSecrets}>
        Delete stored keys
      </button>
    </section>
  );
}
