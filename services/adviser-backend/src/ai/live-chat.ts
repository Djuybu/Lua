import type { ProductVariant } from '../contracts/catalog.ts';
import { CATEGORY_PURPOSES, VALID_CATEGORIES, VALID_PRIORITIES, validateConfirmedProfile } from '../contracts/taxonomy.ts';

export type ChatInput = {
  text: string;
  history: Array<{ role: 'user' | 'assistant'; text: string }>;
  profileRevision: number;
};

type ProposedDraft = {
  category: 'phone' | 'tablet' | 'pc_laptop' | 'pc_desktop';
  purposes: string[];
  priorities: string[];
  budget: string;
  minRam: string;
  os: string;
};

function validDraft(value: unknown): value is ProposedDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as ProposedDraft;
  if (!VALID_CATEGORIES.includes(draft.category) ||
      !Array.isArray(draft.purposes) || draft.purposes.length !== 3 ||
      !Array.isArray(draft.priorities) || draft.priorities.length !== 3 ||
      typeof draft.budget !== 'string' || !/^\d+$/.test(draft.budget) ||
      typeof draft.minRam !== 'string' || (draft.minRam !== '' && !/^\d+$/.test(draft.minRam)) ||
      typeof draft.os !== 'string') return false;
  const budget = Number(draft.budget);
  const minRam = draft.minRam === '' ? undefined : Number(draft.minRam);
  return validateConfirmedProfile({
    category: draft.category,
    orderedPurposes: draft.purposes,
    orderedPriorities: draft.priorities,
    budget: { hardCeilingVnd: budget },
    hardConstraints: {
      ...(minRam === undefined ? {} : { minRamGb: minRam }),
      ...(draft.os === '' ? {} : { requiredOs: [draft.os] }),
    },
  }).valid;
}

export class LiveChat {
  private calls = 0;
  private busy = false;
  private options: { mode: string; model: string; key: string; timeoutMs: number; request?: typeof fetch };
  constructor(options: { mode: string; model: string; key: string; timeoutMs: number; request?: typeof fetch }) {
    this.options = options;
  }

  async reply(input: ChatInput, variants: ProductVariant[], signal?: AbortSignal) {
    const sources = variants.slice(0, 8).flatMap((variant) => {
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
      // Qdrant already ranks these candidates. Keep a bounded but broad set so
      // the model can compare more than the small frontend seed catalog.
      const catalog = variants.slice(0, 30).map((variant) => ({
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
          instructions: 'Bạn là trợ lý chọn thiết bị bằng tiếng Việt. Chỉ dùng dữ liệu catalog được cung cấp. Không bịa giá, hiệu năng, tồn kho hoặc khả năng tương thích. Nêu rõ dữ liệu chưa xác minh. Trả lời ngắn gọn, hữu ích; không đưa URL trong nội dung. Khi người dùng đã cung cấp đủ loại thiết bị, ngân sách, đúng 3 mục đích và đúng 3 ưu tiên, hãy trả proposal là biểu mẫu hoàn chỉnh dùng đúng ID taxonomy. Không được tự suy đoán thông tin còn thiếu; khi thiếu hãy trả proposal=null và hỏi tiếp.',
          input: JSON.stringify({
            message: input.text,
            history: input.history.slice(-10),
            retrieval: { source: 'qdrant-lexical', matchedCandidates: variants.length, suppliedCandidates: catalog.length },
            taxonomy: { categories: VALID_CATEGORIES, purposesByCategory: CATEGORY_PURPOSES, priorities: VALID_PRIORITIES },
            catalog,
          }),
          text: { format: { type: 'json_schema', name: 'catalog_chat', strict: true, schema: {
            type: 'object', additionalProperties: false,
            properties: {
              answer: { type: 'string', minLength: 1, maxLength: 6000 },
              proposal: { anyOf: [
                { type: 'null' },
                { type: 'object', additionalProperties: false, properties: {
                  category: { type: 'string', enum: VALID_CATEGORIES },
                  purposes: { type: 'array', items: { type: 'string', enum: Object.values(CATEGORY_PURPOSES).flat() }, minItems: 3, maxItems: 3 },
                  priorities: { type: 'array', items: { type: 'string', enum: VALID_PRIORITIES }, minItems: 3, maxItems: 3 },
                  budget: { type: 'string' },
                  minRam: { type: 'string' },
                  os: { type: 'string' },
                }, required: ['category', 'purposes', 'priorities', 'budget', 'minRam', 'os'] },
              ] },
            },
            required: ['answer', 'proposal'],
          } } },
        }),
      });
      if (!response.ok) return fallback(`provider-${response.status}`);
      const result = await response.json() as any;
      const raw = result.output?.flatMap((item: any) => item.content ?? []).find((item: any) => item.type === 'output_text')?.text;
      const parsed = JSON.parse(raw ?? '{}');
      const answer = parsed.answer;
      if (result.status !== 'completed' || typeof answer !== 'string' || !answer.trim() || answer.length > 6000) return fallback('invalid-output');
      return {
        text: answer.trim(),
        mode: 'provider' as const,
        providerLabel: `OpenAI · ${this.options.model}`,
        sources,
        ...(validDraft(parsed.proposal) ? { proposal: { draft: parsed.proposal, baseProfileRevision: input.profileRevision } } : {}),
      };
    } catch {
      return fallback(signal?.aborted ? 'cancelled' : 'unavailable');
    } finally {
      this.busy = false;
    }
  }
}
