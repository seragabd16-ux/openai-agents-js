'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '../../../lib/utils';
import { StatCard } from '../../../components/stat-card';
import Link from 'next/link';

interface MessageRow {
  id: string;
  to: string;
  status: string;
  error: string | null;
  updatedAt: string;
}

interface CampaignDetailResponse {
  id: string;
  name: string;
  message: string;
  createdAt: string;
  summary: {
    pending: number;
    sent: number;
    failed: number;
    total: number;
  };
  messages: MessageRow[];
}

export default function CampaignDetailPage() {
  const params = useParams();
  const [campaign, setCampaign] = useState<CampaignDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const data = await apiFetch<CampaignDetailResponse>(
        `/api/campaigns/${params.id}`,
      );
      setCampaign(data);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">
            Campaign details
          </h1>
          <p className="text-gray-400 text-sm">Live delivery status</p>
        </div>
        <Link
          href="/campaigns/new"
          className="text-sm text-primary hover:underline"
        >
          New campaign
        </Link>
      </div>

      {error && (
        <div className="rounded-lg bg-red-900/40 border border-red-800 p-3 text-red-100">
          {error}
        </div>
      )}
      {loading && <div className="text-gray-500 text-sm">Loading...</div>}

      {campaign && (
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-800 bg-surface p-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  {campaign.name}
                </h2>
                <p className="text-xs text-gray-500">
                  Created {new Date(campaign.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="text-sm text-gray-300">
                Template: {campaign.message}
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <StatCard label="Total" value={campaign.summary.total} />
            <StatCard label="Sent" value={campaign.summary.sent} />
            <StatCard label="Pending" value={campaign.summary.pending} />
            <StatCard label="Failed" value={campaign.summary.failed} />
          </div>

          <div className="rounded-xl border border-gray-800 bg-surface">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-900/70 text-gray-400">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">To</th>
                    <th className="px-4 py-2 text-left font-medium">Status</th>
                    <th className="px-4 py-2 text-left font-medium">
                      Last update
                    </th>
                    <th className="px-4 py-2 text-left font-medium">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {campaign.messages.map((message) => (
                    <tr key={message.id} className="border-t border-gray-800">
                      <td className="px-4 py-2 text-gray-200">{message.to}</td>
                      <td className="px-4 py-2">
                        <span
                          className={`rounded-full px-2 py-1 text-xs ${
                            message.status === 'sent'
                              ? 'bg-emerald-900/50 text-emerald-200'
                              : message.status === 'failed'
                                ? 'bg-red-900/50 text-red-200'
                                : 'bg-amber-900/50 text-amber-200'
                          }`}
                        >
                          {message.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-gray-400">
                        {new Date(message.updatedAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-gray-400">
                        {message.error || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
