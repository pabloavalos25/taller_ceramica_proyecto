import {webAuthHandlers,unavailable} from '../../../../src/auth/web.mjs';
export const runtime='nodejs';
export async function POST(request){const handlers=webAuthHandlers();return handlers?handlers.correctKilnItem(request):unavailable();}
