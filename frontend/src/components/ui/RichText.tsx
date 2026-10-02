import { Fragment } from 'react';
import type { ReactNode } from 'react';

/**
 * A translated sentence with React elements in some of its placeholders:
 *
 *   <RichText text={t('app.upload.intro')} parts={{ odx: <code>.odx</code> }} />
 *
 * t() leaves a placeholder it was given no value for as it is, so the
 * sentence keeps its word order in every language and only the pieces are
 * swapped in here.
 */
export function RichText({ text, parts }: { text: string; parts: Record<string, ReactNode> }) {
  return (
    <>
      {text.split(/\{(\w+)\}/g).map((piece, i) =>
        // split() with a capture group puts the placeholder names at odd indexes.
        i % 2 === 1 ? <Fragment key={i}>{parts[piece] ?? `{${piece}}`}</Fragment> : piece,
      )}
    </>
  );
}

/** The ".odx" file-type chip used in running text. */
export function OdxChip() {
  return <code className="rounded-sm bg-ink-800 px-1.5 py-0.5 text-xs text-ink-100">.odx</code>;
}
