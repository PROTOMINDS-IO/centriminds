import type { AttributedPeak } from '../api/types';
import { useI18n } from '../i18n';
import { sourceLabel, type Components } from '../lib/sources';

interface Props {
  peaks: AttributedPeak[];
  /** The analysed machine's components, for their names. */
  components?: Components;
  limit?: number;
}

/** Below this match confidence a source label is a guess, so it is dimmed. */
const WEAK_MATCH = 0.5;

/** The `limit` strongest peaks, each with its attributed component and
 *  order, frequency, speed, amplitude (mm/s) and match confidence. */
export default function PeakTable({ peaks, components = [], limit = 12 }: Props) {
  const i18n = useI18n();
  const { t, fmt } = i18n;
  const top = [...peaks]
    .filter((p) => p.amplitude > 0)
    .sort((a, b) => b.amplitude - a.amplitude)
    .slice(0, limit);

  if (top.length === 0) {
    return <p className="text-sm text-ink-300">{t('workspace.sources.noPeaks')}</p>;
  }
  const percent = (fraction: number) =>
    t('workspace.sources.percent', { value: fmt.number(fraction * 100, 0) });

  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-[11px] text-ink-300">
          <tr className="border-b border-ink-700">
            <th className="px-1 py-1.5 text-left font-medium">
              {t('workspace.sources.columns.source')}
            </th>
            <th className="px-1 py-1.5 text-right font-medium">
              {t('workspace.sources.columns.frequency')}
            </th>
            <th className="px-1 py-1.5 text-right font-medium">{t('units.rpm')}</th>
            <th className="px-1 py-1.5 text-right font-medium">
              {t('workspace.sources.columns.amplitude')}
            </th>
            <th className="px-1 py-1.5 text-right font-medium">
              {t('workspace.sources.columns.match')}
            </th>
          </tr>
        </thead>
        <tbody>
          {top.map((p, i) => {
            const weak = !p.source_id || p.confidence < WEAK_MATCH;
            return (
              <tr key={i} className="border-b border-ink-700/60">
                <td className={`px-1 py-1.5 ${weak ? 'text-ink-400' : 'text-ink-100'}`}>
                  {sourceLabel(p.source_id, components, i18n)}
                  {p.source_id && (
                    <span className="ml-1 text-ink-300">
                      {t('workspace.sources.harmonic', { order: p.harmonic })}
                    </span>
                  )}
                </td>
                <td className="px-1 py-1.5 text-right tabular-nums">{fmt.number(p.freq_hz, 2)}</td>
                <td className="px-1 py-1.5 text-right tabular-nums">{fmt.number(p.rpm, 0)}</td>
                <td className="px-1 py-1.5 text-right tabular-nums">
                  {fmt.number(p.amplitude, 2)}
                </td>
                <td className={`px-1 py-1.5 text-right tabular-nums ${weak ? 'text-ink-400' : ''}`}>
                  {p.source_id ? percent(p.confidence) : '–'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 px-1 text-[11px] text-ink-400">
        {t('workspace.sources.weakNote', { percent: percent(WEAK_MATCH) })}
      </p>
    </div>
  );
}
