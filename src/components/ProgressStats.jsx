export default function ProgressStats({ wordStats, streak }) {
  const { new: newCount, learning, known, total } = wordStats;
  const pct = (n) => (total ? (n / total) * 100 : 0);

  return (
    <div className="progress-stats">
      {total > 0 && (
        <>
          <div className="progress-stats__bar" title={`${known} known · ${learning} learning · ${newCount} new`}>
            <div className="progress-stats__seg progress-stats__seg--known" style={{ width: `${pct(known)}%` }} />
            <div className="progress-stats__seg progress-stats__seg--learning" style={{ width: `${pct(learning)}%` }} />
            <div className="progress-stats__seg progress-stats__seg--new" style={{ width: `${pct(newCount)}%` }} />
          </div>
          <span className="progress-stats__label">
            {known}/{total} words known
          </span>
        </>
      )}
      {streak > 1 && (
        <span className="progress-stats__streak" title="Consecutive days visited">
          🔥 {streak} day{streak === 1 ? "" : "s"}
        </span>
      )}
    </div>
  );
}
