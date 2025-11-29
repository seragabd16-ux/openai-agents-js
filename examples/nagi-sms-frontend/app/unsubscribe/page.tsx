'use client';

import { useState } from 'react';
import { apiFetch } from '../../lib/utils';
import { toast } from 'sonner';

export default function UnsubscribePage() {
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!phone) {
      toast.error('Please add a phone number');
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch('/api/unsubscribe', {
        method: 'POST',
        body: JSON.stringify({ phone }),
      });
      toast.success('Number added to unsubscribe list');
      setPhone('');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-4 rounded-xl border border-gray-800 bg-surface p-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-white">Unsubscribe</h1>
        <p className="text-sm text-gray-400">
          Opt-out from all future SMS messages.
        </p>
      </div>
      <div className="space-y-2">
        <label className="text-sm text-gray-300">Phone number</label>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+12065550123"
        />
      </div>
      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-gray-900 shadow hover:opacity-90"
      >
        {submitting ? 'Submitting...' : 'Unsubscribe me'}
      </button>
      <div className="text-xs text-gray-500">
        This form is public. We respect the list before any SMS campaign is
        delivered.
      </div>
    </div>
  );
}
