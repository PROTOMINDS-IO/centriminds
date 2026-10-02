import type { SeverityZone } from '../api/types';
import { useI18n } from '../i18n';
import { ZONES, zoneLabel } from '../lib/severity';

/** Zone pill: colour dot + label, so the state never rides on colour alone. */
export default function ZoneBadge({
  zone,
  className = '',
}: {
  zone: SeverityZone;
  className?: string;
}) {
  const { t } = useI18n();
  const z = ZONES[zone];
  return (
    <span className={`pill gap-1.5 whitespace-nowrap ${z.pill} ${className}`}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: z.hex }} aria-hidden />
      {zoneLabel(zone, t)}
    </span>
  );
}
