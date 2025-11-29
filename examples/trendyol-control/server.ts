import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { URL } from 'node:url';
import {
  Agent,
  RunItem,
  RunMessageOutputItem,
  RunResult,
  RunState,
  RunToolApprovalItem,
  run,
} from '@openai/agents';
import { TrendyolClient } from './trendyolClient';
import { createTrendyolAgent } from './createAgent';

interface TranscriptEntry {
  id: string;
  kind: 'user' | 'assistant' | 'tool-call' | 'tool-result' | 'reasoning';
  title: string;
  body: string;
  timestamp: string;
}

interface SessionState {
  id: string;
  agent: Agent<any, any>;
  transcript: TranscriptEntry[];
  processedItems: number;
  pendingState?: string;
}

interface RunResponsePayload {
  status: 'needsApproval' | 'completed';
  sessionId: string;
  transcript: TranscriptEntry[];
  approvals?: ApprovalPayload[];
  finalOutput?: unknown;
  finalOutputText?: string;
}

interface ApprovalPayload {
  index: number;
  toolName: string;
  agentName: string;
  argumentsPreview: string;
  summary?: string;
}

type DecisionPayload =
  | {
      decision: 'approve';
      always?: boolean;
    }
  | {
      decision: 'reject';
      always?: boolean;
    };

const PORT = Number(process.env.PORT ?? 8787);
const client = TrendyolClient.fromEnv();
const baseAgent = createTrendyolAgent(client);
const sessions = new Map<string, SessionState>();

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/') {
    respondHtml(res, DASHBOARD_HTML);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/run') {
    void handleRunRequest(req, res);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/decide') {
    void handleDecisionRequest(req, res);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    respondJson(res, 200, { status: 'ok' });
    return;
  }

  respondJson(res, 404, { error: 'المورد غير موجود.' });
});

server.listen(PORT, () => {
  console.log(`خادم لوحة Trendyol يعمل على المنفذ http://localhost:${PORT}`);
});

async function handleRunRequest(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = await readJson(req);
    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';

    if (!prompt) {
      respondJson(res, 400, {
        error: 'يرجى كتابة طلب باللغة العربية أو الإنجليزية.',
      });
      return;
    }

    const session = createSession();
    session.transcript.push(createEntry('user', 'العميل', prompt));

    const result = await run(baseAgent, prompt);
    updateSessionFromResult(session, result);

    const payload = buildPayloadFromResult(session, result);
    respondJson(res, 200, payload);
  } catch (error) {
    console.error('فشل تنفيذ الطلب:', error);
    respondJson(res, 500, {
      error:
        error instanceof Error
          ? error.message
          : 'حدث خطأ غير متوقع أثناء تشغيل الوكيل.',
    });
  }
}

async function handleDecisionRequest(
  req: IncomingMessage,
  res: ServerResponse,
) {
  try {
    const body = await readJson(req);
    const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : '';
    const index = Number(body?.index);

    if (!sessionId || Number.isNaN(index)) {
      respondJson(res, 400, { error: 'طلب غير مكتمل للموافقة.' });
      return;
    }

    const session = sessions.get(sessionId);
    if (!session || !session.pendingState) {
      respondJson(res, 400, { error: 'لا يوجد تشغيل بانتظار الموافقة.' });
      return;
    }

    const state = await RunState.fromString(baseAgent, session.pendingState);
    const interruptions = state.getInterruptions();
    const approvalItem = interruptions[index];

    if (!approvalItem) {
      respondJson(res, 404, { error: 'تعذر العثور على طلب الموافقة المطلوب.' });
      return;
    }

    const decision: DecisionPayload = {
      decision:
        body?.decision === 'reject' || body?.decision === 'approve'
          ? body.decision
          : 'reject',
      always: Boolean(body?.always),
    };

    if (decision.decision === 'approve') {
      state.approve(approvalItem, { alwaysApprove: decision.always });
    } else {
      state.reject(approvalItem, { alwaysReject: decision.always });
    }

    const result = await run(baseAgent, state);
    updateSessionFromResult(session, result);

    const payload = buildPayloadFromResult(session, result);
    respondJson(res, 200, payload);
  } catch (error) {
    console.error('فشل معالجة قرار الموافقة:', error);
    respondJson(res, 500, {
      error:
        error instanceof Error
          ? error.message
          : 'حدث خطأ غير متوقع أثناء معالجة الموافقة.',
    });
  }
}

function createSession(): SessionState {
  const id = randomUUID();
  const session: SessionState = {
    id,
    agent: baseAgent,
    transcript: [],
    processedItems: 0,
  };
  sessions.set(id, session);
  return session;
}

function updateSessionFromResult(
  session: SessionState,
  result: RunResult<unknown, Agent<any, any>>,
) {
  const allItems = result.newItems;
  const newItems = allItems.slice(session.processedItems);
  const entries = convertItemsToEntries(newItems);
  session.transcript.push(...entries);
  session.processedItems = allItems.length;

  if (result.interruptions && result.interruptions.length > 0) {
    session.pendingState = result.state.toString();
  } else {
    session.pendingState = undefined;
  }
}

function buildPayloadFromResult(
  session: SessionState,
  result: RunResult<unknown, Agent<any, any>>,
): RunResponsePayload {
  const approvals =
    result.interruptions && result.interruptions.length > 0
      ? result.interruptions.map((item: RunToolApprovalItem, index: number) =>
          formatApproval(item, index),
        )
      : undefined;

  const finalOutput =
    result.interruptions && result.interruptions.length > 0
      ? undefined
      : safeClone(result.finalOutput ?? null);

  return {
    status: approvals ? 'needsApproval' : 'completed',
    sessionId: session.id,
    transcript: session.transcript,
    approvals,
    finalOutput,
    finalOutputText:
      finalOutput !== undefined ? stringify(finalOutput) : undefined,
  };
}

function convertItemsToEntries(items: RunItem[]): TranscriptEntry[] {
  return items.map((item) => {
    switch (item.type) {
      case 'message_output_item': {
        const text = extractMessageText(item as RunMessageOutputItem);
        return createEntry('assistant', 'الوكيل', text);
      }
      case 'tool_call_item': {
        const rawItem = item.rawItem as { name?: string; arguments?: unknown };
        const toolName = rawItem?.name ?? 'أداة غير معروفة';
        const argsPreview =
          stringify(rawItem?.arguments ?? rawItem) || 'لا توجد بيانات.';
        return createEntry('tool-call', toolName, argsPreview);
      }
      case 'tool_call_output_item': {
        const rawItem = item.rawItem as { call_id?: string; name?: string };
        const title = rawItem?.call_id ?? rawItem?.name ?? 'نتيجة الأداة';
        const outputText = stringify((item as any).output ?? item.rawItem);
        return createEntry('tool-result', title, outputText);
      }
      case 'reasoning_item': {
        const rawItem = (item.rawItem as any) ?? {};
        const reasoning = Array.isArray(rawItem.reasoning)
          ? rawItem.reasoning
              .map((part: any) =>
                part?.type === 'output_text' ? part.text : undefined,
              )
              .filter(Boolean)
              .join(' ')
          : stringify(rawItem.reasoning ?? rawItem);
        return createEntry('reasoning', 'تفكير النموذج', reasoning);
      }
      default: {
        return createEntry(
          'assistant',
          'عنصر غير معروف',
          stringify(item.rawItem),
        );
      }
    }
  });
}

function formatApproval(
  item: RunToolApprovalItem,
  index: number,
): ApprovalPayload {
  const json = item.toJSON();
  const rawItem = json.rawItem as { name?: string; arguments?: unknown };
  const argumentsPreview =
    stringify(rawItem?.arguments ?? rawItem) || 'لا توجد بيانات.';
  const summary = extractSummary(rawItem?.arguments);
  return {
    index,
    toolName: rawItem?.name ?? 'أداة غير معروفة',
    agentName: json.agent?.name ?? 'الوكيل',
    argumentsPreview,
    summary,
  };
}

function extractMessageText(item: RunMessageOutputItem): string {
  const segments: string[] = [];
  for (const part of item.rawItem.content ?? []) {
    if (part.type === 'output_text') {
      segments.push(part.text);
    }
  }
  return segments.join('').trim() || 'لا يوجد نص.';
}

function extractSummary(value: unknown): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsed =
      typeof value === 'string'
        ? JSON.parse(value)
        : typeof value === 'object'
          ? value
          : undefined;
    if (parsed && typeof parsed === 'object' && 'summary' in parsed) {
      const summary = (parsed as Record<string, unknown>).summary;
      return typeof summary === 'string' ? summary : undefined;
    }
  } catch (_error) {
    // ignore JSON parsing issues – we just return undefined for summary
  }

  return undefined;
}

function createEntry(
  kind: TranscriptEntry['kind'],
  title: string,
  body: string,
): TranscriptEntry {
  return {
    id: randomUUID(),
    kind,
    title,
    body,
    timestamp: new Date().toISOString(),
  };
}

async function readJson(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  const raw = Buffer.concat(chunks).toString('utf-8');
  return raw ? JSON.parse(raw) : {};
}

function respondJson(res: ServerResponse, status: number, payload: unknown) {
  const data = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data).toString(),
  });
  res.end(data);
}

function respondHtml(res: ServerResponse, html: string) {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(html).toString(),
  });
  res.end(html);
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch (_error) {
    return String(value);
  }
}

function safeClone<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

const DASHBOARD_HTML = `<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>لوحة تحكم Trendyol الذكية</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: 'Segoe UI', Tahoma, sans-serif;
        background-color: #0f172a;
        color: #e2e8f0;
      }

      body {
        margin: 0;
        padding: 0;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        background: radial-gradient(circle at top, #1e293b, #020617 70%);
      }

      header {
        padding: 24px 32px;
        background: rgba(15, 23, 42, 0.8);
        backdrop-filter: blur(8px);
        border-bottom: 1px solid rgba(148, 163, 184, 0.2);
      }

      header h1 {
        margin: 0;
        font-size: 1.8rem;
        font-weight: 600;
      }

      main {
        flex: 1;
        display: grid;
        gap: 24px;
        padding: 24px;
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      }

      section {
        background: rgba(15, 23, 42, 0.7);
        border: 1px solid rgba(148, 163, 184, 0.15);
        border-radius: 18px;
        padding: 20px;
        box-shadow: 0 18px 45px rgba(15, 23, 42, 0.35);
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      h2 {
        margin: 0;
        font-size: 1.3rem;
        font-weight: 600;
      }

      form {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      textarea {
        width: 100%;
        min-height: 120px;
        padding: 12px;
        border-radius: 12px;
        border: 1px solid rgba(148, 163, 184, 0.3);
        background: rgba(15, 23, 42, 0.6);
        color: inherit;
        resize: vertical;
      }

      button {
        padding: 12px 16px;
        border-radius: 12px;
        border: none;
        cursor: pointer;
        font-weight: 600;
        background: linear-gradient(135deg, #38bdf8, #6366f1);
        color: #0f172a;
        transition: transform 0.15s ease, box-shadow 0.15s ease;
      }

      button[disabled] {
        opacity: 0.6;
        cursor: not-allowed;
      }

      button:not([disabled]):hover {
        transform: translateY(-1px);
        box-shadow: 0 10px 24px rgba(99, 102, 241, 0.35);
      }

      .transcript {
        display: flex;
        flex-direction: column;
        gap: 12px;
        max-height: 420px;
        overflow-y: auto;
        padding-inline-end: 8px;
      }

      .entry {
        padding: 14px;
        border-radius: 12px;
        border: 1px solid rgba(148, 163, 184, 0.12);
        background: rgba(15, 23, 42, 0.6);
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .entry.user {
        border-color: rgba(16, 185, 129, 0.35);
      }

      .entry.assistant {
        border-color: rgba(59, 130, 246, 0.35);
      }

      .entry.tool-call {
        border-color: rgba(249, 115, 22, 0.35);
      }

      .entry.tool-result {
        border-color: rgba(168, 85, 247, 0.35);
      }

      .entry.reasoning {
        border-color: rgba(234, 179, 8, 0.35);
        font-size: 0.9rem;
        font-style: italic;
      }

      .entry-title {
        font-weight: 600;
        font-size: 0.95rem;
        color: #38bdf8;
      }

      .entry-body {
        white-space: pre-wrap;
        word-break: break-word;
        line-height: 1.5;
      }

      .approvals {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .approval-card {
        border-radius: 12px;
        border: 1px solid rgba(248, 113, 113, 0.3);
        padding: 14px;
        background: rgba(127, 29, 29, 0.25);
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .approval-actions {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }

      .status {
        font-size: 0.95rem;
        color: #facc15;
      }

      pre {
        background: rgba(15, 23, 42, 0.6);
        border-radius: 12px;
        border: 1px solid rgba(148, 163, 184, 0.12);
        padding: 16px;
        max-height: 320px;
        overflow: auto;
        direction: ltr;
        text-align: left;
      }

      label {
        font-size: 0.85rem;
        display: flex;
        gap: 8px;
        align-items: center;
      }

      @media (max-width: 768px) {
        main {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <header>
      <h1>لوحة تحكم Trendyol الذكية</h1>
      <p>أدخل أوامر العمل وسيتولى الوكيل توليد القرارات، مع إبراز أي طلبات موافقة حساسة.</p>
    </header>
    <main>
      <section>
        <h2>إرسال طلب جديد</h2>
        <form id="prompt-form">
          <textarea id="prompt" placeholder="مثال: قيّم أداء الحملات الحالية وقترح ميزانية للأسبوع القادم"></textarea>
          <button type="submit">تشغيل الوكيل</button>
          <div class="status" id="status"></div>
        </form>
      </section>
      <section>
        <h2>السجل التفاعلي</h2>
        <div class="transcript" id="transcript"></div>
      </section>
      <section>
        <h2>طلبات الموافقة</h2>
        <div class="approvals" id="approvals"></div>
      </section>
      <section>
        <h2>النتيجة النهائية</h2>
        <pre id="final-output">—</pre>
      </section>
    </main>
    <script>
      (function () {
        const form = document.getElementById('prompt-form');
        const promptInput = document.getElementById('prompt');
        const transcript = document.getElementById('transcript');
        const approvals = document.getElementById('approvals');
        const status = document.getElementById('status');
        const finalOutput = document.getElementById('final-output');
        let sessionId = null;
        let waitingForApproval = false;

        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const prompt = promptInput.value.trim();
          if (!prompt || waitingForApproval) {
            return;
          }
          toggleForm(true);
          status.textContent = 'جاري تشغيل الوكيل...';

          try {
            const response = await fetch('/run', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ prompt }),
            });
            const data = await response.json();
            handleResponse(data);
          } catch (error) {
            console.error(error);
            status.textContent = 'تعذر الوصول إلى الخادم. تأكد من تشغيله محلياً.';
          } finally {
            promptInput.value = '';
          }
        });

        function renderTranscript(entries) {
          transcript.replaceChildren();
          entries.forEach((entry) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'entry ' + entry.kind;

            const title = document.createElement('div');
            title.className = 'entry-title';
            title.textContent = entry.title;
            wrapper.appendChild(title);

            const body = document.createElement('div');
            body.className = 'entry-body';
            body.textContent = entry.body;
            wrapper.appendChild(body);

            transcript.appendChild(wrapper);
          });
          transcript.scrollTop = transcript.scrollHeight;
        }

        function renderApprovals(pending) {
          approvals.replaceChildren();
          if (!pending || pending.length === 0) {
            waitingForApproval = false;
            return;
          }

          waitingForApproval = true;
          pending.forEach((item) => {
            const card = document.createElement('div');
            card.className = 'approval-card';

            const header = document.createElement('div');
            header.innerHTML = '<strong>' + item.agentName + '</strong> يقترح استخدام الأداة <strong>' + item.toolName + '</strong>';
            card.appendChild(header);

            if (item.summary) {
              const summary = document.createElement('div');
              summary.textContent = 'ملخص الوكيل: ' + item.summary;
              card.appendChild(summary);
            }

            const args = document.createElement('pre');
            args.textContent = item.argumentsPreview;
            card.appendChild(args);

            const checkboxLabel = document.createElement('label');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkboxLabel.appendChild(checkbox);
            checkboxLabel.append('السماح لنفس الأداة طوال هذا التشغيل');
            card.appendChild(checkboxLabel);

            const actions = document.createElement('div');
            actions.className = 'approval-actions';

            const approveButton = document.createElement('button');
            approveButton.type = 'button';
            approveButton.textContent = 'موافقة';
            approveButton.addEventListener('click', () =>
              submitDecision(item.index, 'approve', checkbox.checked, card),
            );

            const rejectButton = document.createElement('button');
            rejectButton.type = 'button';
            rejectButton.textContent = 'رفض';
            rejectButton.style.background = 'linear-gradient(135deg, #f97316, #ef4444)';
            rejectButton.addEventListener('click', () =>
              submitDecision(item.index, 'reject', checkbox.checked, card),
            );

            actions.appendChild(approveButton);
            actions.appendChild(rejectButton);
            card.appendChild(actions);

            approvals.appendChild(card);
          });
        }

        async function submitDecision(index, decision, always, card) {
          if (!sessionId) {
            return;
          }
          card.querySelectorAll('button').forEach((button) => (button.disabled = true));
          status.textContent = 'تم إرسال القرار...';
          try {
            const response = await fetch('/decide', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionId, index, decision, always }),
            });
            const data = await response.json();
            handleResponse(data);
          } catch (error) {
            console.error(error);
            status.textContent = 'حدث خطأ أثناء إرسال القرار.';
          }
        }

        function handleResponse(data) {
          if (!data) {
            status.textContent = 'لا توجد استجابة من الخادم.';
            return;
          }

          if (data.error) {
            status.textContent = data.error;
            toggleForm(false);
            return;
          }

          sessionId = data.sessionId;
          renderTranscript(data.transcript || []);
          renderApprovals(data.approvals || []);

          if (data.status === 'needsApproval') {
            status.textContent = 'بانتظار موافقة يدوية لإكمال التنفيذ.';
            toggleForm(true);
          } else {
            status.textContent = 'اكتمل تشغيل الوكيل.';
            toggleForm(false);
          }

          if (data.finalOutputText) {
            finalOutput.textContent = data.finalOutputText;
          }
        }

        function toggleForm(disabled) {
          const submitButton = form.querySelector('button[type="submit"]');
          submitButton.disabled = disabled;
          promptInput.disabled = disabled;
        }
      })();
    </script>
  </body>
</html>`;
