/**
 * =============================================================================
 * `EvidenceExhibit` — one labelled piece of the record, shown in full
 * =============================================================================
 *
 * The verdict record's unit. Criteria, deliverable, verdict, the exact prompt,
 * the raw model response — each is an exhibit, and each is shown at full length
 * with no summarisation, because a reviewer's job is to read the criteria against
 * the deliverable and decide whether the verdict follows.
 *
 * THE LEFT RULE IS THE INFORMATION. `membership` selects between two rule tokens
 * whose documented meanings are "bytes-for-bytes inside the hashed preimage" and
 * "recorded metadata, not in the preimage". A reader who learns those two can
 * tell which exhibits the hash commits to WITHOUT READING A LABEL, which is the
 * single strongest thing separating this screen from a grid of identical cards.
 * Property 63 asserts the correspondence, so the mapping is not decorative.
 *
 * A MACHINE TRANSCRIPT IS RECESSED, NOT RAISED. `kind: 'transcript'` drops the
 * body to the recessed well and the record step: a prompt and a raw model
 * response are console output, not prose, and sinking them into the page is what
 * makes them read that way. Prose bodies keep a 68ch measure; a transcript does
 * not, because wrapping machine output to a prose measure misrepresents it.
 */

import type { ReactNode } from 'react';

interface EvidenceExhibitProps {
  /** What this exhibit is. Sits inside the panel, above a within-record rule. */
  label: string;

  /**
   * Whether the hashed preimage commits to this content.
   *
   * `hashed` — one of the seventeen preimage fields.
   * `excluded` — recorded metadata the hash deliberately omits, such as the
   *   timestamp, which is what makes the digest reproducible.
   */
  membership: 'hashed' | 'excluded';

  /**
   * `prose` is human text at a reading measure. `transcript` is machine output:
   * recessed ground, record step, no measure.
   */
  kind?: 'prose' | 'transcript';

  /** One sentence under the label, where the exhibit needs a note. */
  note?: string;

  children: ReactNode;
}

export function EvidenceExhibit({
  label,
  membership,
  kind = 'prose',
  note,
  children,
}: EvidenceExhibitProps) {
  const rule = membership === 'hashed' ? 'rule-hashed' : 'rule-excluded';
  const transcript = kind === 'transcript';

  return (
    <section className="bg-panel-1 flex flex-col rounded-[--radius-panel] border border-panel-edge">
      {/* The label sits INSIDE the panel over a within-record rule, rather than
          floating above it. An exhibit is one object: its name belongs to it. */}
      <header className="rule-record px-5 py-3.5">
        <h3 className="text-caption text-muted uppercase">{label}</h3>
        {note === undefined ? null : (
          <p className="text-meta text-muted pt-1.5">{note}</p>
        )}
      </header>

      <div className={`px-5 py-4 ${transcript ? 'bg-well rounded-b-[--radius-panel]' : ''}`}>
        <div
          className={
            transcript
              ? `${rule} text-record text-primary [overflow-wrap:anywhere] whitespace-pre-wrap`
              : `${rule} text-body text-primary max-w-[68ch] whitespace-pre-wrap`
          }
        >
          {children}
        </div>
      </div>
    </section>
  );
}
