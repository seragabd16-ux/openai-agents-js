'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '../../../lib/utils';
import { StatCard } from '../../../components/stat-card';
import { toast } from 'sonner';

interface CampaignResponse {
  id: string;
  name: string;
  message: string;
  createdAt: string;
  total: number;
}

interface CampaignDetails {
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
  messages: {
    id: string;
    to: string;
    status: string;
    error: string | null;
    updatedAt: string;
  }[];
}

export default function NewCampaignPage() {
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [numbersText, setNumbersText] = useState('');
  const [campaign, setCampaign] = useState<CampaignResponse | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);
  const [isSending, setSending] = useState(false);
  const [progress, setProgress] = useState<CampaignDetails | null>(null);
  const [testMode, setTestMode] = useState(false);

  const numbers = useMemo(
    () =>
      numbersText
        .split(/\n|,|;/)
        .map((n) => n.trim())
        .filter(Boolean),
    [numbersText],
  );

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (campaign) {
      const fetchProgress = async () => {
        try {
          const details = await apiFetch<CampaignDetails>(
            `/api/campaigns/${campaign.id}`,
          );
          setProgress(details);
        } catch (err) {
          console.error(err);
        }
      };
      fetchProgress();
      interval = setInterval(fetchProgress, 4000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [campaign]);

  const handleSubmit = async () => {
    if (!name || !message || numbers.length === 0) {
      toast.error('Please provide name, message, and at least one number.');
      return;
    }

    setSubmitting(true);
    try {
      const created = await apiFetch<CampaignResponse>('/api/campaigns', {
        method: 'POST',
        body: JSON.stringify({ name, message, numbers }),
      });
      setCampaign(created);
      toast.success('Campaign created. You can send it now.');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSend = async () => {
    if (!campaign) return;
    setSending(true);
    try {
      await apiFetch(
        `/api/campaigns/${campaign.id}/send${testMode ? '?testMode=true' : ''}`,
        {
          method: 'POST',
          body: JSON.stringify({ testMode }),
        },
      );
      toast.success('Sending started');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  const characterCount = message.length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">New campaign</h1>
          <p className="text-gray-400 text-sm">
            Create a message and reach your subscribers.
          </p>
        </div>
        {campaign && (
          <Link
            className="text-sm text-primary hover:underline"
            href={`/campaigns/${campaign.id}`}
          >
            View details
          </Link>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl border border-gray-800 bg-surface p-4 space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-sm text-gray-300">Campaign name</label>
              <span className="text-xs text-gray-500">Required</span>
            </div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Holiday promo blast"
            />
          </div>

          <div className="rounded-xl border border-gray-800 bg-surface p-4 space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-sm text-gray-300">Message</label>
              <span className="text-xs text-gray-500">
                {characterCount} characters
              </span>
            </div>
            <textarea
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Hey {{name}}, thanks for being with us!"
            />
            <p className="text-xs text-gray-500">
              Use {{ name }} style placeholders. Variables align with the
              numbers list order.
            </p>
          </div>

          <div className="rounded-xl border border-gray-800 bg-surface p-4 space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-sm text-gray-300">Recipients</label>
              <span className="text-xs text-gray-500">Up to 6000 numbers</span>
            </div>
            <textarea
              rows={6}
              value={numbersText}
              onChange={(e) => setNumbersText(e.target.value)}
              placeholder="One phone number per line"
            />
            <p className="text-xs text-gray-500">
              We automatically skip numbers on the unsubscribe list.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={testMode}
              onChange={(e) => setTestMode(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm text-gray-300">
              Test mode (mark messages sent without calling provider)
            </span>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleSubmit}
              disabled={
                isSubmitting || numbers.length === 0 || !name || !message
              }
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-gray-900 shadow hover:opacity-90"
            >
              {isSubmitting ? 'Saving...' : 'Create campaign'}
            </button>
            {campaign && (
              <button
                onClick={handleSend}
                disabled={isSending}
                className="rounded-md border border-primary px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/10"
              >
                {isSending ? 'Starting...' : 'Send campaign'}
              </button>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <StatCard label="Numbers" value={numbers.length} helper="imported" />
          {progress && (
            <div className="rounded-xl border border-gray-800 bg-surface p-4 space-y-2">
              <div className="text-sm font-semibold text-white">
                Live progress
              </div>
              <div className="text-sm text-gray-300">
                Sent: {progress.summary.sent}
              </div>
              <div className="text-sm text-gray-300">
                Pending: {progress.summary.pending}
              </div>
              <div className="text-sm text-gray-300">
                Failed: {progress.summary.failed}
              </div>
            </div>
          )}
          <div className="rounded-xl border border-gray-800 bg-surface p-4 text-xs text-gray-500 space-y-1">
            <div className="font-semibold text-gray-300">Compliance</div>
            <p>Only message contacts who have opted in.</p>
            <p>We filter out numbers in your unsubscribe list.</p>
            <p>Follow carrier rules for opt-out keywords and rate limits.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
