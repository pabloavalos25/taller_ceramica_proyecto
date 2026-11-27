import { webAuthHandlers, unavailable } from '../../../../src/auth/web.mjs';
export const dynamic='force-dynamic';
export async function GET(request){return webAuthHandlers()?.studentTeacher(request) ?? unavailable();}
export async function POST(request){return webAuthHandlers()?.studentTeacher(request) ?? unavailable();}
