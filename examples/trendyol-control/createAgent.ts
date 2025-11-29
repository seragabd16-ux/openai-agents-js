import { Agent } from '@openai/agents';
import { TrendyolClient } from './trendyolClient';
import { createTrendyolTools } from './tools';

export function createTrendyolAgent(client: TrendyolClient): Agent<any, any> {
  const { readTool, mutateTool } = createTrendyolTools(client);

  return new Agent({
    name: 'Trendyol Control Agent',
    instructions: `أنت مدير عمليات لمتجر Trendyol يحمل رقم المورد ${client.supplierId}. استخدم أدوات Trendyol لقراءة البيانات ثم اتخذ قرارات مدروسة. اتبع هذه المبادئ:
- اقرأ أحدث البيانات قبل كل تعديل.
- لخّص كل تغيير مقترح واذكر سببك داخل الحقل summary عند استدعاء أدوات التعديل.
- اطلب موافقة بشرية عند الحاجة وانتظر التعليمات.
- قدّم الإجابات باللغة العربية مع تلخيص تنفيذي قصير.`,
    toolUseBehavior: {
      allowParallelToolCalls: false,
    },
    tools: [readTool, mutateTool],
  });
}
