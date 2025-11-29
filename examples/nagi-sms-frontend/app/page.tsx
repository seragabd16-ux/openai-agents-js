'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../lib/utils';
import { StatCard } from '../components/stat-card';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Link from 'next/link';

interface Campaign {
  id: string;
  name: string;
  message: string;
  createdAt: string;
  messages: { status: 'pending' | 'sent' | 'failed' }[];
  total: number;
  sent: number;
  failed: number;
}

export default function DashboardPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await apiFetch<Campaign[]>('/api/campaigns');
        setCampaigns(data);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const totals = useMemo(() => {
    const totalCampaigns = campaigns.length;
    const sent = campaigns.reduce((acc, campaign) => acc + campaign.sent, 0);
    const failed = campaigns.reduce(
      (acc, campaign) => acc + campaign.failed,
      0,
    );
    const pending = campaigns.reduce(
      (acc, campaign) =>
        acc + (campaign.total - campaign.sent - campaign.failed),
      0,
    );
    return { totalCampaigns, sent, failed, pending };
  }, [campaigns]);

  const chartData = useMemo(() => {
    const byDate: Record<string, number> = {};
    campaigns.forEach((campaign) => {
      const date = new Date(campaign.createdAt).toLocaleDateString();
      byDate[date] = (byDate[date] || 0) + campaign.sent;
    });
    return Object.entries(byDate).map(([date, value]) => ({ date, value }));
  }, [campaigns]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
        <p className="text-gray-400 text-sm">
          Monitor your SMS performance at a glance.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-900/40 border border-red-800 p-3 text-red-100">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard label="Campaigns" value={totals.totalCampaigns} />
        <StatCard
          label="Messages Sent"
          value={totals.sent}
          helper="Delivered to recipients"
        />
        <StatCard
          label="Pending"
          value={totals.pending}
          helper="Awaiting send"
        />
        <StatCard
          label="Failed"
          value={totals.failed}
          helper="Action required"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="col-span-2 rounded-xl border border-gray-800 bg-surface p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">
              Messages sent per day
            </h2>
            <span className="text-xs text-gray-500">Aggregated</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ left: 0, right: 0 }}>
                <defs>
                  <linearGradient id="colorSent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#9ca3af', fontSize: 12 }}
                />
                <YAxis
                  tick={{ fill: '#9ca3af', fontSize: 12 }}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: '#111827',
                    border: '1px solid #1f2937',
                    color: 'white',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#22d3ee"
                  fillOpacity={1}
                  fill="url(#colorSent)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-gray-800 bg-surface p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">
              Recent campaigns
            </h2>
            <Link
              href="/campaigns/new"
              className="text-sm text-primary hover:underline"
            >
              New campaign
            </Link>
          </div>
          <div className="space-y-3">
            {loading && <div className="text-gray-500 text-sm">Loading...</div>}
            {!loading && campaigns.length === 0 && (
              <div className="text-gray-500 text-sm">No campaigns yet.</div>
            )}
            {campaigns.slice(0, 5).map((campaign) => (
              <Link
                href={`/campaigns/${campaign.id}`}
                key={campaign.id}
                className="block rounded-lg border border-gray-800 bg-gray-900/40 p-3 hover:border-primary/40"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-white font-medium">
                      {campaign.name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(campaign.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-right text-sm text-gray-300">
                    <div>Sent: {campaign.sent}</div>
                    <div className="text-amber-300">
                      Pending:{' '}
                      {campaign.total - campaign.sent - campaign.failed}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
