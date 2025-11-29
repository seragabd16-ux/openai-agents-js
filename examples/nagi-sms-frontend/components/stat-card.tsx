interface StatCardProps {
  label: string;
  value: string | number;
  helper?: string;
}

export function StatCard({ label, value, helper }: StatCardProps) {
  return (
    <div className="rounded-xl border border-gray-800 bg-surface p-4 shadow-sm">
      <div className="text-sm text-gray-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      {helper && <div className="mt-1 text-xs text-gray-500">{helper}</div>}
    </div>
  );
}
