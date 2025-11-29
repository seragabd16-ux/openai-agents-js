'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '../../lib/utils';

interface CampaignSummary {
  id: string;
  name: string;
  createdAt: string;
  total: number;
  sent: number;
  failed: number;
}

export default function CampaignListPage() {
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await apiFetch<CampaignSummary[]>('/api/campaigns');
        setCampaigns(data);
      } catch (err) {
        setError((err as Error).message);
      }
    };
    load();
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Campaigns</h1>
          <p className="text-gray-400 text-sm">Track all campaigns.</p>
        </div>
        <Link
          className="text-sm text-primary hover:underline"
          href="/campaigns/new"
        >
          New campaign
        </Link>
      </div>

      {error && (
        <div className="rounded-lg bg-red-900/40 border border-red-800 p-3 text-red-100">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-gray-800 bg-surface">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-900/70 text-gray-400">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Name</th>
                <th className="px-4 py-2 text-left font-medium">Created</th>
                <th className="px-4 py-2 text-left font-medium">Sent</th>
                <th className="px-4 py-2 text-left font-medium">Pending</th>
                <th className="px-4 py-2 text-left font-medium">Failed</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((campaign) => (
                <tr
                  key={campaign.id}
                  className="border-t border-gray-800 hover:bg-gray-900/40"
                >
                  <td className="px-4 py-2 text-primary">
                    <Link href={`/campaigns/${campaign.id}`}>
                      {campaign.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-gray-400">
                    {new Date(campaign.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-gray-200">{campaign.sent}</td>
                  <td className="px-4 py-2 text-amber-200">
                    {campaign.total - campaign.sent - campaign.failed}
                  </td>
                  <td className="px-4 py-2 text-red-200">{campaign.failed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
