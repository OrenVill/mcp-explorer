interface Props {
  onLock: () => void;
}

export function VaultLockButton({ onLock }: Props) {
  return (
    <button
      type="button"
      onClick={onLock}
      className="text-xs px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium transition-colors flex items-center gap-1.5"
      title="Lock vault and clear decrypted data"
    >
      <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5" aria-hidden>
        <path
          d="M5.5 7V5.75a2.5 2.5 0 015 0V7M4.5 7h7a1 1 0 011 1v4a1 1 0 01-1 1h-7a1 1 0 01-1-1V8a1 1 0 011-1z"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Lock
    </button>
  );
}
