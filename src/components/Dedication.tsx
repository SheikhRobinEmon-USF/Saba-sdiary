import { journalConfig } from '../config/journalConfig';

/** The dedication line, configured in journalConfig (recipient name optional). */
export default function Dedication({ className = 'dedication' }: { className?: string }) {
  const { dedication, recipientName } = journalConfig;
  if (!dedication) return null;
  return (
    <p className={className}>
      {recipientName ? <span className="dedication-to">For {recipientName} — </span> : null}
      <span>{recipientName ? dedication.replace(/^For you,\s*/i, '') : dedication}</span>
    </p>
  );
}
