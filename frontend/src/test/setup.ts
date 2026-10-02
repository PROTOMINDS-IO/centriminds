import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Tests run as under reduced motion: no animations to wait for. A test of
// the animations themselves overrides this (vi.mocked(...).mockReturnValue).
vi.mock('../lib/motion', () => ({ prefersReducedMotion: vi.fn(() => true) }));

afterEach(() => cleanup());
