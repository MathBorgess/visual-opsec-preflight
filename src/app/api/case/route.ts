import { api } from '@/server/api';
export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return api(request, 'get');
}
export async function DELETE(request: Request) {
  return api(request, 'delete');
}
