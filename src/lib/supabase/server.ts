// ============================================================
// src/lib/supabase/server.ts
// عميل Supabase للسيرفر (Server Components و Route Handlers).
// ============================================================
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // استُدعي من Server Component — الـ middleware يتولى التحديث.
          }
        },
      },
    },
  );
}

// ------------------------------------------------------------
// عميل بصلاحيات كاملة. يتجاوز الـ RLS.
// استعمله فقط داخل Route Handlers للعمليات الموثوقة.
// لا تستورده أبداً من ملف فيه 'use client'.
// ------------------------------------------------------------
export function createServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY مفقود');

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    key,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {
          /* لا جلسة */
        },
      },
    },
  );
}
