import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import {
  Agent,
  type AgentInputItem,
  type RunResult,
  type RunState,
  run,
} from '@openai/agents';
import { TrendyolClient } from './trendyolClient';
import { createTrendyolAgent } from './createAgent';

type SupportedState =
  | string
  | AgentInputItem[]
  | RunState<unknown, Agent<any, any>>;

main().catch((error) => {
  console.error('فشل تشغيل وكيل Trendyol:', error);
  process.exit(1);
});

async function main() {
  const args = process.argv.slice(2);
  const interactive = args.includes('--interactive');
  const rawInput = args.filter((arg) => arg !== '--interactive').join(' ');

  const client = TrendyolClient.fromEnv();
  const agent = createTrendyolAgent(client);

  const prompt =
    rawInput ||
    'حلّل المبيعات الحالية، ثم اقترح تحديثات مخزون وحملة إعلانية متوازنة باستخدام أدوات Trendyol.';

  const result = await runWithApprovals(agent, prompt, interactive);
  logFinalOutput(result.finalOutput);
}

async function runWithApprovals(
  agent: Agent<any, any>,
  initial: SupportedState,
  interactive: boolean,
): Promise<RunResult<unknown, Agent<any, any>>> {
  let stateOrInput: SupportedState = initial;
  let result = await run(agent, stateOrInput);

  while (result.interruptions && result.interruptions.length > 0) {
    if (!interactive) {
      console.log('هناك طلبات موافقة تحتاج إلى مراجعة قبل المتابعة:');
      for (const interruption of result.interruptions) {
        const parsedArgs = parseToolArguments(interruption.rawItem.arguments);
        console.log('- الوكيل:', interruption.agent.name);
        console.log('  الأداة:', interruption.rawItem.name);
        console.log('  الملخص:', parsedArgs?.summary ?? 'لم يتم توفير ملخص.');
        console.log('  الوسيطات:', interruption.rawItem.arguments);
      }
      console.log(
        'أعد تشغيل السكربت مع الخيار --interactive لمعالجة هذه الطلبات.',
      );
      return result;
    }

    for (const interruption of result.interruptions) {
      const parsedArgs = parseToolArguments(interruption.rawItem.arguments);
      const approved = await promptApproval(
        `يرغب الوكيل ${interruption.agent.name} في استخدام الأداة ${interruption.rawItem.name} بهذه الوسيطات:\n${
          interruption.rawItem.arguments
        }\nالملخص: ${parsedArgs?.summary ?? 'غير متوفر'}\nهل توافق؟ (y/n): `,
      );
      if (approved) {
        result.state.approve(interruption);
      } else {
        result.state.reject(interruption);
      }
    }

    stateOrInput = result.state;
    result = await run(agent, stateOrInput);
  }

  return result;
}

function logFinalOutput(outputValue: unknown) {
  console.log('\n=== المخرجات النهائية ===');
  if (typeof outputValue === 'string') {
    console.log(outputValue);
    return;
  }
  console.log(JSON.stringify(outputValue, null, 2));
}

async function promptApproval(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input, output });
  const answer = await rl.question(question);
  rl.close();
  const normalized = answer.trim().toLowerCase();
  return normalized === 'y' || normalized === 'yes' || normalized === 'نعم';
}

function parseToolArguments(rawArguments: string | undefined):
  | {
      summary?: string;
    }
  | undefined {
  if (!rawArguments) {
    return undefined;
  }

  try {
    return JSON.parse(rawArguments);
  } catch (_error) {
    console.warn('تعذر تحليل الوسيطات كـ JSON. سيتم إظهارها كسلسلة نصية.');
    return undefined;
  }
}
