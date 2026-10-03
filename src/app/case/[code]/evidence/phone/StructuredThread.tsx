// ============================================================
// src/app/case/[code]/evidence/phone/StructuredThread.tsx
// عرض محادثة مبنينة — فقط لما القضية تزوّد رسائل حقيقية (بيانات
// مصدر). تصميم سجل أدلة محايد، مش نسخة عن تطبيق مراسلة: ما في حالة
// "متصل" ولا علامات قراءة ولا أوقات مُختلقة — الوقت/المرسل يظهر فقط
// لو موجود بالبيانات.
// ============================================================
'use client';

import type { StructuredThread as Thread } from './phoneTypes';
import styles from './PhoneExamination.module.css';

export default function StructuredThread({ thread }: { thread: Thread }) {
  return (
    <section className={styles.thread} aria-label={thread.label ?? 'سجل المحادثة'}>
      {thread.label && <h4 className={styles.threadLabel}>{thread.label}</h4>}
      <ol className={styles.threadList}>
        {thread.messages.map((m, i) => (
          <li key={i} className={styles.message} data-direction={m.direction}>
            {(m.sender || m.time) && (
              <span className={styles.messageMeta}>
                {m.sender && <span>{m.sender}</span>}
                {m.time && (
                  <span className={styles.messageTime} dir="ltr">
                    {m.time}
                  </span>
                )}
              </span>
            )}
            <p className={styles.messageText}>{m.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
