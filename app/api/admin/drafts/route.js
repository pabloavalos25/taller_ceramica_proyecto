import {webAuthHandlers,unavailable} from '../../../../src/auth/web.mjs';
export const runtime='nodejs';
export async function GET(request){const handlers=webAuthHandlers();return handlers?handlers.draftQuery(request):unavailable();}
export async function POST(request){const handlers=webAuthHandlers();return handlers?handlers.draftMutation(request):unavailable();}
