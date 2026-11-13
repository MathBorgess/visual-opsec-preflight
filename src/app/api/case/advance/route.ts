import { api } from '@/server/api';
export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  return api(request, 'advance');
}
