// German. Typed against the English messages: a missing key does not compile.
// The user is addressed formally ("Sie").
import type { Messages } from '../en';
import { app } from './app';
import { common, units } from './common';
import { colormaps, sources, zones } from './domain';
import { errors } from './errors';
import { workspace } from './workspace';

export const de: Messages = {
  common,
  units,
  zones,
  sources,
  colormaps,
  errors,
  app,
  workspace,
};
