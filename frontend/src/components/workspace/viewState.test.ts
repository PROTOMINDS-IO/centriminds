import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, useSettingsStore } from '../../store/settingsStore';
import { useUIStore } from '../../store/uiStore';

describe('workspace view state', () => {
  beforeEach(() => useUIStore.getState().resetForProject());
  afterEach(() => useSettingsStore.setState(DEFAULT_SETTINGS));

  it('shows order lines up to 3×, the likely zones and the speed-independent lines', () => {
    expect(useUIStore.getState()).toMatchObject({
      showOrderLines: true,
      maxLineOrder: 3,
      showZones: true,
      zoneFilter: 'strong',
      showStationary: true,
      showAnnotations: true,
    });
    useUIStore.getState().setMaxLineOrder(0);
    expect(useUIStore.getState().maxLineOrder).toBe(1);
  });

  it('opens each project with the user’s view defaults and nothing of the last one', () => {
    useSettingsStore.setState({ default_view: 'top', default_scale: 'log' });
    useUIStore.getState().setPicking(true);
    useUIStore.getState().setPicked({ freqHz: 50, rpm: 1000 });
    useUIStore.setState({
      analysisPanel: 'machine',
      displayOpen: true,
      rpmFilter: { min: 1, max: 2 },
    });

    useUIStore.getState().resetForProject();
    expect(useUIStore.getState()).toMatchObject({
      viewMode: 'top',
      ampScaleMode: 'log',
      picking: false,
      picked: null,
      rpmFilter: null,
      analysisPanel: null,
      displayOpen: false,
    });
  });
});
