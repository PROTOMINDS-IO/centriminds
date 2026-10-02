// The view card, top right: how you are looking at the measurement. One
// toolbar row — [3D | Top] · spectrum at one speed · auto-rotate · reset ·
// Display — where Display expands the display settings inside the card; the
// Display button, the close button or Escape collapses them. On phones the
// card is a single View button whose content opens as a bottom sheet.
import { useCallback, useId } from 'react';

import type { PhysicsResults } from '../../api/types';
import { usePresence } from '../../hooks/usePresence';
import { useI18n } from '../../i18n';
import { useUIStore } from '../../store/uiStore';
import { ChromeButton, ToolbarDivider } from '../ui/controls';
import { SlidersIcon } from '../ui/icons';
import Reveal from '../ui/Reveal';
import DisplayPanel from '../waterfall/DisplayPanel';
import { FloatingCard, Sheet } from './FloatingCard';
import { RIGHT_CARD_REM, focusIsIn, useCloseOnEscape, useWide } from './chrome';
import { ViewControlList, ViewToolbar } from './ViewControls';

interface Props {
  projectId: number;
  physics: PhysicsResults | undefined;
  rpmMin: number;
  rpmMax: number;
  freqMin: number;
  freqMax: number;
}

export default function ViewCard({ projectId, physics, rpmMin, rpmMax, freqMin, freqMax }: Props) {
  const { t } = useI18n();
  const wide = useWide();
  const open = useUIStore((s) => s.displayOpen);
  const setOpen = useUIStore((s) => s.setDisplayOpen);
  const setAnalysisPanel = useUIStore((s) => s.setAnalysisPanel);
  const sectionOpen = useUIStore((s) => s.analysisPanel !== null);
  const triggerId = useId();

  function toggle() {
    // Phones show one sheet at a time.
    if (!open && !wide) setAnalysisPanel(null);
    setOpen(!open);
  }

  // Collapse, and give focus back to the button if it was inside the card.
  const close = useCallback(() => {
    const refocus = focusIsIn('right');
    setOpen(false);
    if (refocus) document.getElementById(triggerId)?.focus();
  }, [setOpen, triggerId]);
  useCloseOnEscape(open, close, 'right');

  const title = t('workspace.view.title');
  const panel = usePresence(open && wide);
  // One sheet at a time, also after a resize from wide with both open.
  const sheet = usePresence(open && !wide && !sectionOpen);

  if (!wide) {
    return (
      <>
        <FloatingCard side="right" label={title}>
          <div className="p-1.5">
            <ChromeButton
              id={triggerId}
              on={open}
              aria-expanded={open}
              aria-label={title}
              title={title}
              onClick={toggle}
            >
              <SlidersIcon />
              <span className="hidden sm:inline">{title}</span>
            </ChromeButton>
          </div>
        </FloatingCard>
        {sheet.mounted && (
          <Sheet side="right" title={title} onClose={close} exiting={sheet.exiting}>
            <div className="space-y-4">
              <ViewControlList />
              <DisplayPanel
                projectId={projectId}
                physics={physics}
                rpmMin={rpmMin}
                rpmMax={rpmMax}
                freqMin={freqMin}
                freqMax={freqMax}
                layout="sheet"
              />
            </div>
          </Sheet>
        )}
      </>
    );
  }

  return (
    <FloatingCard
      side="right"
      label={title}
      widthRem={RIGHT_CARD_REM}
      expanded={panel.mounted && !panel.exiting}
    >
      {/* Right-aligned, so nothing moves under the pointer as the card widens. */}
      <div className="flex shrink-0 items-center justify-end gap-1 p-1.5">
        <ViewToolbar />
        <ToolbarDivider />
        <ChromeButton id={triggerId} on={open} aria-expanded={open} onClick={toggle}>
          <SlidersIcon />
          {t('workspace.view.display')}
        </ChromeButton>
      </div>
      {panel.mounted && (
        <Reveal open={!panel.exiting} className="min-h-0 w-0 min-w-full flex-1">
          <div className="flex min-h-0 flex-1 flex-col border-t border-edge/10">
            <DisplayPanel
              projectId={projectId}
              physics={physics}
              rpmMin={rpmMin}
              rpmMax={rpmMax}
              freqMin={freqMin}
              freqMax={freqMax}
              layout="card"
              onClose={close}
            />
          </div>
        </Reveal>
      )}
    </FloatingCard>
  );
}
