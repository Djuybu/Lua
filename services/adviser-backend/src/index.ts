/**
 * @lua/adviser-backend
 * Public entrypoint exporting contracts, domain logic, persistence, and AI adapters.
 */

export * from './contracts/index.ts';
export * from './domain/eligibility.ts';
export * from './domain/ranking.ts';
export * from './data/ingest.ts';
export * from './data/sqlite.ts';
export * from './ai/validator.ts';
export * from './ai/fallback.ts';
export * from './ai/adapter.ts';
export * from './ai/live-chat.ts';
export * from './server/http-app.ts';
