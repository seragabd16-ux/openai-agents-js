import cors from 'cors';
import dotenv from 'dotenv';
import express, { NextFunction, Request, Response } from 'express';
import pLimit from 'p-limit';
import prisma from './prisma';
import { applyTemplate, delay, normalizePhone } from './utils';
import { campaignSchema, unsubscribeSchema } from './validators';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
const API_KEY = process.env.NAGI_API_KEY;
const SMS_PROVIDER_URL = process.env.SMS_PROVIDER_URL;
const SMS_PROVIDER_KEY = process.env.SMS_PROVIDER_KEY;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.use((req, res, next) => {
  if (req.path === '/api/unsubscribe') {
    return next();
  }

  if (!API_KEY) {
    return res.status(500).json({ error: 'NAGI_API_KEY not configured' });
  }

  const headerKey = req.headers['x-nagi-api-key'];
  if (headerKey !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
});

app.post(
  '/api/campaigns',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = campaignSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: result.error.flatten() });
      }

      const { name, message, numbers, variables } = result.data;
      const normalizedNumbers = numbers
        .map((num) => normalizePhone(num))
        .filter(Boolean);

      if (normalizedNumbers.length === 0) {
        return res.status(400).json({
          error: 'No valid phone numbers provided after normalization.',
        });
      }

      const created = await prisma.campaign.create({
        data: {
          name,
          message,
          messages: {
            create: normalizedNumbers.map((to, idx) => ({
              to,
              status: 'pending',
              variables: variables?.[idx] || undefined,
            })),
          },
        },
        include: {
          messages: true,
        },
      });

      return res.status(201).json({
        id: created.id,
        name: created.name,
        message: created.message,
        createdAt: created.createdAt,
        total: created.messages.length,
      });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  '/api/campaigns/:id/send',
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const testMode =
      req.query.testMode === 'true' || (req.body && req.body.testMode === true);
    const limit = pLimit(10);
    let jobId: string | null = null;

    if (!testMode && (!SMS_PROVIDER_URL || !SMS_PROVIDER_KEY)) {
      return res
        .status(500)
        .json({ error: 'SMS provider configuration missing' });
    }

    try {
      const campaign = await prisma.campaign.findUnique({ where: { id } });
      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      const pendingMessages = await prisma.message.findMany({
        where: { campaignId: id, status: 'pending' },
        orderBy: { createdAt: 'asc' },
      });

      const unsubscribed = await prisma.unsubscribe.findMany();
      const unsubscribedSet = new Set(unsubscribed.map((entry) => entry.phone));

      let sent = 0;
      let failed = 0;
      let skippedUnsubscribed = 0;

      const job = await prisma.job.create({
        data: {
          type: 'campaign-send',
          campaignId: id,
          status: 'running',
          stats: JSON.stringify({ total: pendingMessages.length }),
        },
      });
      jobId = job.id;

      await Promise.all(
        pendingMessages.map((message) =>
          limit(async () => {
            if (unsubscribedSet.has(normalizePhone(message.to))) {
              skippedUnsubscribed += 1;
              failed += 1;
              await prisma.message.update({
                where: { id: message.id },
                data: { status: 'failed', error: 'Recipient unsubscribed' },
              });
              return;
            }

            const text = applyTemplate(
              campaign.message,
              (message.variables || undefined) as
                | Record<string, string>
                | undefined,
            );

            if (testMode) {
              sent += 1;
              await prisma.message.update({
                where: { id: message.id },
                data: {
                  status: 'sent',
                  providerResponse: 'Test mode - not sent',
                },
              });
              return;
            }

            try {
              const response = await fetch(SMS_PROVIDER_URL, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${SMS_PROVIDER_KEY}`,
                },
                body: JSON.stringify({ to: message.to, message: text }),
              });

              if (!response.ok) {
                const body = await response.text();
                failed += 1;
                await prisma.message.update({
                  where: { id: message.id },
                  data: { status: 'failed', error: body.slice(0, 500) },
                });
                return;
              }

              const providerResponse = await response.text();
              sent += 1;
              await prisma.message.update({
                where: { id: message.id },
                data: {
                  status: 'sent',
                  providerResponse: providerResponse.slice(0, 1000),
                },
              });
              await delay(100);
            } catch (err) {
              failed += 1;
              await prisma.message.update({
                where: { id: message.id },
                data: { status: 'failed', error: (err as Error).message },
              });
            }
          }),
        ),
      );

      const totals = {
        total: pendingMessages.length,
        sent,
        failed,
        skippedUnsubscribed,
      };

      if (jobId) {
        await prisma.job.update({
          where: { id: jobId },
          data: {
            status: 'finished',
            finishedAt: new Date(),
            stats: JSON.stringify(totals),
          },
        });
      }

      return res.json(totals);
    } catch (error) {
      if (jobId) {
        await prisma.job.update({
          where: { id: jobId },
          data: {
            status: 'failed',
            finishedAt: new Date(),
            stats: JSON.stringify({ error: (error as Error).message }),
          },
        });
      } else {
        await prisma.job.create({
          data: {
            type: 'campaign-send',
            campaignId: id,
            status: 'failed',
            stats: JSON.stringify({ error: (error as Error).message }),
          },
        });
      }
      next(error);
    }
  },
);

app.get(
  '/api/campaigns',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const campaigns = await prisma.campaign.findMany({
        orderBy: { createdAt: 'desc' },
        include: { messages: true },
      });

      const response = campaigns.map((campaign) => {
        const total = campaign.messages.length;
        const sent = campaign.messages.filter(
          (m) => m.status === 'sent',
        ).length;
        const failed = campaign.messages.filter(
          (m) => m.status === 'failed',
        ).length;
        return { ...campaign, total, sent, failed };
      });

      return res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  '/api/campaigns/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const campaign = await prisma.campaign.findUnique({
        where: { id: req.params.id },
        include: {
          messages: { orderBy: { createdAt: 'desc' } },
        },
      });

      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      const pending = campaign.messages.filter(
        (m) => m.status === 'pending',
      ).length;
      const sent = campaign.messages.filter((m) => m.status === 'sent').length;
      const failed = campaign.messages.filter(
        (m) => m.status === 'failed',
      ).length;

      return res.json({
        ...campaign,
        summary: { pending, sent, failed, total: campaign.messages.length },
      });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  '/api/unsubscribe',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = unsubscribeSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: result.error.flatten() });
      }

      const phone = normalizePhone(result.data.phone);
      if (!phone) {
        return res.status(400).json({ error: 'Phone number is invalid' });
      }

      const entry = await prisma.unsubscribe.upsert({
        where: { phone },
        update: {},
        create: { phone },
      });

      return res.status(201).json({ phone: entry.phone });
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  '/api/jobs',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const jobs = await prisma.job.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
      return res.json(jobs);
    } catch (error) {
      next(error);
    }
  },
);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`NAGI-SMS backend running on port ${PORT}`);
});
