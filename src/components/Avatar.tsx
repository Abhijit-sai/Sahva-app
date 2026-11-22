import { useState } from "react";

interface AvatarProps {
  src?: string;
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_MAP = {
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-14 h-14 text-base",
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Avatar({
  src,
  name,
  size = "md",
  className = "",
}: AvatarProps) {
  const [failed, setFailed] = useState<string>();

  if (!src || failed === src) {
    return (
      <div
        aria-label={name}
        className={`${SIZE_MAP[size]} rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-display font-semibold flex items-center justify-center shrink-0 select-none ${className}`}
      >
        {getInitials(name)}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      referrerPolicy="no-referrer"
      onError={() => setFailed(src)}
      className={`${SIZE_MAP[size]} rounded-full object-cover shrink-0 bg-slate-200 dark:bg-slate-800 ${className}`}
    />
  );
}
