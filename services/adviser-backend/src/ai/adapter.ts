/**
 * Bounded AI Adapter and Client
 * Enforces timeout (≤5000ms), validation guard, and automatic fallback.
 */

import { type AiExplanationProposal } from '../contracts/ai.ts';
import { type ProductVariant, type FactAssertion } from '../contracts/catalog.ts';
import { type ConfirmedNeedsProfile } from '../contracts/taxonomy.ts';
import { validateExplanationProposal } from './validator.ts';
import { generateDeterministicFallbackExplanation } from './fallback.ts';

export interface AiRequestOptions {
  variant: ProductVariant;
  profile: ConfirmedNeedsProfile;
  facts: FactAssertion[];
  requestId: string;
}

export interface AiProvider {
  name: string;
  generateExplanation(options: AiRequestOptions): Promise<AiExplanationProposal>;
}

export class MockAiProvider implements AiProvider {
  public name = 'mock_provider';
  public shouldTimeout = false;
  public shouldError = false;
  public shouldReturnInvalid = false;
  public timeoutMs = 100;

  public async generateExplanation(options: AiRequestOptions): Promise<AiExplanationProposal> {
    if (this.shouldTimeout) {
      await new Promise(r => setTimeout(r, this.timeoutMs + 500));
    }

    if (this.shouldError) {
      throw new Error('Upstream AI Provider Error: Rate limit 429');
    }

    if (this.shouldReturnInvalid) {
      // Hallucinated factId
      return {
        requestId: options.requestId,
        variantId: options.variant.variantId,
        claims: [
          {
            kind: 'advantage',
            relation: 'MAGIC_AI_BENEFIT',
            factIds: ['hallucinated_fact_9999'],
            wordingKey: 'wording_advantage_performance_suitable'
          }
        ],
        isFallback: false
      };
    }

    // Valid mock explanation
    const knownFactId = options.facts[0]?.factId ?? 'f1';
    return {
      requestId: options.requestId,
      variantId: options.variant.variantId,
      claims: [
        {
          kind: 'advantage',
          relation: 'HIGH_PERFORMANCE_FOR_WORKLOAD',
          factIds: [knownFactId],
          wordingKey: 'wording_advantage_performance_suitable'
        }
      ],
      isFallback: false
    };
  }
}

export class BoundedAiClient {
  private provider: AiProvider;
  private timeoutMs: number;

  constructor(provider: AiProvider, timeoutMs: number = 5000) {
    this.provider = provider;
    this.timeoutMs = timeoutMs;
  }

  public async getExplanation(options: AiRequestOptions): Promise<AiExplanationProposal> {
    const { variant, profile, facts, requestId } = options;
    const knownFactIds = new Set(facts.map(f => f.factId));

    try {
      // Race provider call against timeout promise
      const providerPromise = this.provider.generateExplanation(options);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('AI_TIMEOUT')), this.timeoutMs);
      });

      const rawProposal = await Promise.race([providerPromise, timeoutPromise]);

      // Strict validation of AI output
      const validation = validateExplanationProposal(rawProposal, variant.variantId, knownFactIds);
      if (!validation.valid) {
        return generateDeterministicFallbackExplanation(
          variant,
          profile,
          facts,
          `AI_OUTPUT_REJECTED: ${validation.errors.join('; ')}`,
          requestId
        );
      }

      return rawProposal;
    } catch (err: any) {
      const reason = err?.message === 'AI_TIMEOUT' ? 'AI_TIMEOUT' : `AI_PROVIDER_ERROR: ${err?.message || 'unknown'}`;
      return generateDeterministicFallbackExplanation(variant, profile, facts, reason, requestId);
    }
  }
}
