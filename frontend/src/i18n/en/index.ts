// English: the source language. Every key the app uses is defined here.
import { app } from './app';
import { common, units } from './common';
import { colormaps, sources, zones } from './domain';
import { errors } from './errors';
import { workspace } from './workspace';

export const en = { common, units, zones, sources, colormaps, errors, app, workspace };

export type Messages = typeof en;
