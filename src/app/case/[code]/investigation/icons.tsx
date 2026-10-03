// ============================================================
// src/app/case/[code]/investigation/icons.tsx
// مجموعة رموز SVG صغيرة ومتّسقة (خط 1.6، currentColor). زخرفية
// دائماً (aria-hidden) — النص المجاور هو اللي يحمل المعنى.
// ============================================================

import type { ReactNode } from 'react';

function Svg({ children, size = 16 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

type P = { size?: number };

/** رجوع — بواجهة من اليمين لليسار، الرجوع يتجه لليمين (بداية السطر). */
export const IconBack = ({ size }: P) => (
  <Svg size={size}>
    <path d="M9 5l7 7-7 7" />
  </Svg>
);

export const IconLock = ({ size }: P) => (
  <Svg size={size}>
    <rect x="5" y="11" width="14" height="9" rx="1.5" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Svg>
);

export const IconUnlock = ({ size }: P) => (
  <Svg size={size}>
    <rect x="5" y="11" width="14" height="9" rx="1.5" />
    <path d="M8 11V8a4 4 0 0 1 7.5-2" />
  </Svg>
);

export const IconTeam = ({ size }: P) => (
  <Svg size={size}>
    <circle cx="9" cy="8" r="3" />
    <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
    <path d="M16 5.5a3 3 0 0 1 0 5.5M17.5 14.5a5.5 5.5 0 0 1 3 4.5" />
  </Svg>
);

export const IconTransmit = ({ size }: P) => (
  <Svg size={size}>
    <path d="M12 20V10" />
    <path d="M8 13l4-4 4 4" />
    <path d="M5 7.5a10 10 0 0 1 14 0" />
    <path d="M7.8 10.3a6 6 0 0 1 8.4 0" opacity="0.6" />
  </Svg>
);

export const IconEye = ({ size }: P) => (
  <Svg size={size}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="2.8" />
  </Svg>
);

export const IconEyeOff = ({ size }: P) => (
  <Svg size={size}>
    <path d="M4 4l16 16" />
    <path d="M9.5 6a9 9 0 0 1 2.5-.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.6M6.2 7.8A17 17 0 0 0 2.5 12S6 18.5 12 18.5a9 9 0 0 0 3.5-.7" />
  </Svg>
);

export const IconClock = ({ size }: P) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);

export const IconCheck = ({ size }: P) => (
  <Svg size={size}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);

export const IconSearch = ({ size }: P) => (
  <Svg size={size}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </Svg>
);

export const IconDevice = ({ size }: P) => (
  <Svg size={size}>
    <rect x="4" y="5" width="16" height="11" rx="1" />
    <path d="M2.5 19h19" />
  </Svg>
);

export const IconCamera = ({ size }: P) => (
  <Svg size={size}>
    <path d="M3 8.5h11.5v7H3z" />
    <path d="M14.5 10.5l5-2.5v8l-5-2.5" />
  </Svg>
);

export const IconDoor = ({ size }: P) => (
  <Svg size={size}>
    <path d="M6 21V4h12v17" />
    <path d="M3.5 21h17" />
    <circle cx="14.5" cy="12.5" r="0.9" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconFlask = ({ size }: P) => (
  <Svg size={size}>
    <path d="M9.5 3.5h5M10.5 3.5v5.5L5 19a1.3 1.3 0 0 0 1.1 2h11.8a1.3 1.3 0 0 0 1.1-2l-5.5-10V3.5" />
    <path d="M7.5 15h9" />
  </Svg>
);

export const IconFile = ({ size }: P) => (
  <Svg size={size}>
    <path d="M6 3h8l4 4v14H6z" />
    <path d="M14 3v4h4M9 12h6M9 16h6" />
  </Svg>
);

export const IconTag = ({ size }: P) => (
  <Svg size={size}>
    <path d="M3.5 12.5V4h8.5l8.5 8.5-8.5 8.5z" />
    <circle cx="8" cy="8.5" r="1.3" />
  </Svg>
);

export const IconPin = ({ size }: P) => (
  <Svg size={size}>
    <path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z" />
    <circle cx="12" cy="10" r="2.3" />
  </Svg>
);

/** رمز نوع العنصر — مصدر واحد للمشهد ووضع الفحص. */
export function CategoryIcon({ category, size = 14 }: { category: string; size?: number }) {
  switch (category) {
    case 'device':
      return <IconDevice size={size} />;
    case 'access':
      return <IconDoor size={size} />;
    case 'archive':
      return <IconCamera size={size} />;
    default:
      return <IconTag size={size} />;
  }
}
