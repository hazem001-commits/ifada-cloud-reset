-- ============================================================
-- IFADA — 014_storage.sql
-- Bucket خاص للوسائط الحقيقية (صور/صوت/فيديو/PDF).
-- لا رابط عام دائم لأي دليل — الوصول حصراً عبر رابط موقّع
-- قصير الأجل (~60 ثانية) يُولّد من route.ts بعد فحص السيرفر
-- للعضوية والتخصص (نفس منطق evidence_index).
-- ============================================================

insert into storage.buckets (id, name, public)
values ('case-media', 'case-media', false)
on conflict (id) do update set public = false;

-- لا سياسات select/insert/update/delete على storage.objects لهذا
-- الـ bucket لأي دور متصفح (anon أو authenticated). الوصول فقط
-- عبر service role من route.ts، اللي يتجاوز RLS أصلاً. أي سياسة
-- إضافية هنا كانت لتسمح بوصول مباشر من المتصفح — وهذا ممنوع.
