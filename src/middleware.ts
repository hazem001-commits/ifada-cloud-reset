// ============================================================
// src/middleware.ts
// يعمل على كل طلب. يحدّث الجلسة ويحمي المسارات.
// ============================================================
import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // كل شي ما عدا الملفات الثابتة والصور
    '/((?!_next/static|_next/image|favicon.ico|fonts/|.*\\.(?:svg|png|jpg|jpeg|webp|gif|mp3|wav|woff2?)$).*)',
  ],
};
