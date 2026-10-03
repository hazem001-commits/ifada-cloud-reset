// ============================================================
// src/app/case/[code]/investigation/DeviceWorkspace.tsx
// فحص جهاز رقمي: هوية الجهاز + فهرس ملفات حقيقي فقط (من
// object_workspace لحالة العنصر الحالية). لا ملفات زخرفية ولا
// بيانات وهمية. إجراء الملف = تفاعل موجود أصلاً ومتاح لتخصصي؛
// لو مش متاح، الصف بيتعرض بدون زر.
// ============================================================
'use client';

import type { DeviceFile, ObjectAction } from '@/types/investigationObjects';
import { IconDevice, IconFile } from './icons';
import t from './tools.module.css';

export default function DeviceWorkspace({
  device,
  files,
  actions,
  disabled,
  onAction,
}: {
  device: string | null;
  files: DeviceFile[];
  actions: ObjectAction[];
  disabled: boolean;
  onAction: (code: string) => void;
}) {
  const available = new Set(actions.map((a) => a.code));

  return (
    <section className={t.tool} data-tool="device" aria-label="فحص الجهاز">
      <header className={t.toolHead}>
        <span className={t.toolIcon}>
          <IconDevice size={17} />
        </span>
        <div>
          <p className={t.toolKicker}>فحص رقمي جنائي</p>
          <h4 className={t.toolTitle}>{device ?? 'جهاز'}</h4>
        </div>
        <span className={t.toolTag}>قراءة فقط</span>
      </header>

      <div className={t.toolBody}>
        <div className={t.files} role="table" aria-label="فهرس ملفات الجهاز">
          <div className={t.fileHead} role="row">
            <span role="columnheader">الملف</span>
            <span role="columnheader">النوع</span>
            <span role="columnheader">آخر تعديل</span>
            <span role="columnheader">الحالة</span>
            <span role="columnheader">
              <span className="sr-only">إجراء</span>
            </span>
          </div>

          {files.length === 0 && <p className={t.filesEmpty}>لا توجد ملفات مفهرسة لهذا الجهاز بعد.</p>}

          {files.map((f) => (
            <div key={f.id} className={t.fileRow} role="row">
              <span role="cell" className={t.fileName}>
                <span className={t.fileIcon}>
                  <IconFile size={15} />
                </span>
                {f.name}
              </span>
              <span role="cell" className={t.fileMeta}>
                {f.type ?? '—'}
              </span>
              <span role="cell" className={t.fileTime}>
                {f.modified ?? '—'}
              </span>
              <span role="cell" className={t.fileStatus}>
                {f.status ?? '—'}
              </span>
              <span role="cell">
                {f.action && available.has(f.action) && (
                  <button
                    type="button"
                    className={t.fileAction}
                    disabled={disabled}
                    onClick={() => onAction(f.action as string)}
                  >
                    استخرج المحتوى
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
