"use client";

import { inputClass, Field } from "./shared";

interface Props {
  newRepoMode: "ssh" | "pat";
  setNewRepoMode: (v: "ssh" | "pat") => void;
  newCloneUrl: string;
  setNewCloneUrl: (v: string) => void;
  newCloneUrlHttps: string;
  setNewCloneUrlHttps: (v: string) => void;
  newDeployKey: string;
  setNewDeployKey: (v: string) => void;
  newPat: string;
  setNewPat: (v: string) => void;
}

export default function RemoteTab({
  newRepoMode, setNewRepoMode,
  newCloneUrl, setNewCloneUrl,
  newCloneUrlHttps, setNewCloneUrlHttps,
  newDeployKey, setNewDeployKey,
  newPat, setNewPat,
}: Props) {
  return (
    <>
      <Field label="Clone URL">
        <input
          type="text"
          placeholder={newRepoMode === "ssh" ? "git@github.com:user/repo.git" : "https://github.com/user/repo.git"}
          value={newCloneUrl}
          onChange={(e) => setNewCloneUrl(e.target.value)}
          className={inputClass}
        />
      </Field>

      <Field label="HTTPS URL (for API calls)">
        <input
          type="text"
          placeholder="https://github.com/user/repo.git (if different)"
          value={newCloneUrlHttps}
          onChange={(e) => setNewCloneUrlHttps(e.target.value)}
          className={inputClass}
        />
      </Field>

      <Field label="Auth Mode">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setNewRepoMode("ssh")}
            className={`flex-1 py-2 rounded font-bold text-xs transition-all cursor-pointer ${
              newRepoMode === "ssh"
                ? "bg-cyan-500 text-black shadow-[0_0_8px_rgba(6,182,212,0.3)]"
                : "bg-slate-900 text-slate-400 border border-white/10 hover:bg-slate-800"
            }`}
          >
            SSH Deploy Key
          </button>
          <button
            type="button"
            onClick={() => setNewRepoMode("pat")}
            className={`flex-1 py-2 rounded font-bold text-xs transition-all cursor-pointer ${
              newRepoMode === "pat"
                ? "bg-cyan-500 text-black shadow-[0_0_8px_rgba(6,182,212,0.3)]"
                : "bg-slate-900 text-slate-400 border border-white/10 hover:bg-slate-800"
            }`}
          >
            PAT / Token
          </button>
        </div>
      </Field>

      {newRepoMode === "ssh" ? (
        <Field label="Deploy Key (Private Key)">
          <textarea
            rows={6}
            placeholder="-----BEGIN OPENSSH PRIVATE KEY-----\n..."
            value={newDeployKey}
            onChange={(e) => setNewDeployKey(e.target.value)}
            className={`${inputClass} font-mono text-[11px] resize-none`}
          />
          <p className="text-[9px] text-slate-600 mt-1">
            Leave blank to keep current key. Paste a new key to rotate. Stored encrypted (AES-256-GCM).
          </p>
        </Field>
      ) : (
        <Field label="Personal Access Token">
          <input
            type="password"
            placeholder="Leave blank to keep current"
            value={newPat}
            onChange={(e) => setNewPat(e.target.value)}
            className={inputClass}
          />
          <p className="text-[9px] text-slate-600 mt-1">
            Leave blank to keep current token. Paste new PAT to rotate. Stored encrypted at rest.
          </p>
        </Field>
      )}
    </>
  );
}
