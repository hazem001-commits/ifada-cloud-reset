// ============================================================
// src/lib/supabase/client.ts
// عميل Supabase للمتصفح. anon key فقط — لا مفاتيح سيرفر هنا أبداً.
// ============================================================
'use client';

import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  );
}
