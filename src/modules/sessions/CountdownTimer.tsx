'use client';

import { useEffect, useState } from 'react';

function formatDuration(ms: number): string {
  if (ms <= 0) return 'Time is up!';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || hours > 0) parts.push(`${minutes.toString().padStart(2, '0')}m`);
  parts.push(`${seconds.toString().padStart(2, '0')}s`);
  return parts.join(' ');
}

export default function CountdownTimer({
  deadlineAt,
  onExpired,
}: {
  deadlineAt: string;
  onExpired?: () => void;
}) {
  const [label, setLabel] = useState<string>(() =>
    formatDuration(new Date(deadlineAt).getTime() - Date.now())
  );

  useEffect(() => {
    const deadline = new Date(deadlineAt).getTime();

    const tick = () => {
      const remaining = deadline - Date.now();
      setLabel(formatDuration(remaining));
      if (remaining <= 0 && onExpired) {
        onExpired();
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [deadlineAt, onExpired]);

  return (
    <span className="tabular-nums">
      {label}
    </span>
  );
}
