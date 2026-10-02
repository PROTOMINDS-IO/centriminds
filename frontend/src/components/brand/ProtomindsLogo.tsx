/**
 * The ProtoMinds vendor mark (public/brand/protominds-mark.png, cropped from
 * the official logo).
 *
 * The wordmark is live text, not part of the image: the supplied artwork sets
 * "PROTOMINDS" in bone for dark pages, and as text it inherits `currentColor`
 * so the lockup works wherever it is placed.
 */
export default function ProtomindsLogo({
  withWordmark = false,
  className = '',
  markClassName = 'h-[1.15em] w-auto',
}: {
  withWordmark?: boolean;
  className?: string;
  markClassName?: string;
}) {
  const mark = (
    <img
      src="/brand/protominds-mark.png"
      alt={withWordmark ? '' : 'ProtoMinds'}
      aria-hidden={withWordmark || undefined}
      className={`shrink-0 ${markClassName}`}
      draggable={false}
    />
  );
  if (!withWordmark) return mark;
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {mark}
      <span className="font-semibold tracking-[0.14em]">PROTOMINDS</span>
    </span>
  );
}
