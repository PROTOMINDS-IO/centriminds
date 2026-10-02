// A section that slides open inside a card: its height grows from nothing
// to its content (a grid row animating 0fr → 1fr, which works without
// measuring) while it fades in, and the reverse when it closes. The opening
// starts from the closed state through @starting-style (`starting:`), so no
// script timing is involved; browsers without it simply open at once. Keep
// it mounted with open={false} until the closing has played (usePresence).
import type { ReactNode } from 'react';

export default function Reveal({
  open,
  className = '',
  children,
}: {
  open: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-open={open}
      className={`grid grid-rows-[1fr] opacity-100 transition-[grid-template-rows,opacity] duration-250 ease-smooth data-[open=false]:grid-rows-[0fr] data-[open=false]:opacity-0 starting:grid-rows-[0fr] starting:opacity-0 ${className}`}
    >
      <div className="flex min-h-0 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
