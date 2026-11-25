import { webAuthHandlers, unavailable } from '../../../../src/auth/web.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request) { const handlers = webAuthHandlers(); return handlers ? handlers.getFeePrices(request) : unavailable(); }
export async function POST(request) { const handlers = webAuthHandlers(); return handlers ? handlers.setFeePrice(request) : unavailable(); }
