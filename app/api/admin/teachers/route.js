import { webAuthHandlers, unavailable } from '../../../../src/auth/web.mjs';
export const dynamic='force-dynamic';
export async function GET(request){return webAuthHandlers()?.teachers(request) ?? unavailable();}
export async function POST(request){return webAuthHandlers()?.teachers(request) ?? unavailable();}
export async function DELETE(request){return webAuthHandlers()?.teachers(request) ?? unavailable();}
