import { api } from '@/server/api';
export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return api(request, 'events');
}
