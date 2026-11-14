import type { ProductVariant } from '../contracts/catalog.ts';

export type ChatInput = {
  text: string;
  history: Array<{ role: 'user' | 'assistant'; text: string }>;
  profileRevision: number;
};

export class LiveChat {
  private calls = 0;
  private busy = false;
  private options: { mode: string; model: string; key: string; timeoutMs: number; request?: typeof fetch };
  constructor(options: { mode: string; model: string; key: string; timeoutMs: number; request?: typeof fetch }) {
    this.options = options;
  }

  async reply(input: ChatInput, variants: ProductVariant[], signal?: AbortSignal) {
    const sources = variants.slice(0, 5).flatMap((variant) => {
      const url = (variant as ProductVariant & { sourceUrl?: string }).sourceUrl;
      return url?.startsWith('https://') ? [{ label: variant.modelName, url }] : [];
    });
    const fallback = (reason: string) => ({
      text: variants.length
        ? `Mình tìm thấy ${variants.length} cấu hình liên quan. Hãy mở các nguồn bên dưới để đối chiếu thông số và giá; tổng chi phí và hiệu năng thực tế vẫn cần xác minh.`
        : 'Mình chưa tìm thấy cấu hình phù hợp trong catalog hiện tại. Bạn có thể cho biết ngân sách, mục đích sử dụng và ba ưu tiên chính.',
      mode: 'fallback' as const,
      providerLabel: `Lua catalog (${reason})`,
      sources,
    });
    if (this.options.mode !== 'provider') return fallback(this.options.mode);
    if (this.busy || this.calls >= 20) return fallback('local-limit');
    this.busy = true;
    this.calls++;
    try {
      const catalog = variants.slice(0, 12).map((variant) => ({
        variantId: variant.variantId,
        modelName: variant.modelName,
        brand: variant.brand,
        category: variant.category,
        specifications: variant.specifications,
        observedPriceVnd: (variant as ProductVariant & { observedPriceVnd?: number }).observedPriceVnd ?? null,
      }));
      const response = await (this.options.request ?? fetch)('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.options.key}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.any([AbortSignal.timeout(this.options.timeoutMs), ...(signal ? [signal] : [])]),
        body: JSON.stringify({
          model: this.options.model,
          store: false,
          max_output_tokens: 900,
          instructions: 'Bạn là trợ lý chọn thiết bị bằng tiếng Việt. Chỉ dùng dữ liệu catalog được cung cấp. Không bịa giá, hiệu năng, tồn kho hoặc khả năng tương thích. Nêu rõ dữ liệu chưa xác minh. Trả lời ngắn gọn, hữu ích; không đưa URL trong nội dung.',
          input: JSON.stringify({ message: input.text, history: input.history.slice(-10), catalog }),
          text: { format: { type: 'json_schema', name: 'catalog_chat', strict: true, schema: {
            type: 'object', additionalProperties: false,
            properties: { answer: { type: 'string', minLength: 1, maxLength: 6000 } },
            required: ['answer'],
          } } },
        }),
      });
      if (!response.ok) return fallback(`provider-${response.status}`);
      const result = await response.json() as any;
      const raw = result.output?.flatMap((item: any) => item.content ?? []).find((item: any) => item.type === 'output_text')?.text;
      const answer = JSON.parse(raw ?? '{}').answer;
      if (result.status !== 'completed' || typeof answer !== 'string' || !answer.trim() || answer.length > 6000) return fallback('invalid-output');
      return { text: answer.trim(), mode: 'provider' as const, providerLabel: `OpenAI · ${this.options.model}`, sources };
    } catch {
      return fallback(signal?.aborted ? 'cancelled' : 'unavailable');
    } finally {
      this.busy = false;
    }
  }
}

