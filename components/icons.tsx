import type { ReactNode, SVGProps } from "react";

interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

function createIcon(paths: ReactNode) {
  return function Icon({
    size = 20,
    "aria-hidden": ariaHidden = true,
    ...props
  }: IconProps) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden={ariaHidden}
        focusable="false"
        {...props}
      >
        {paths}
      </svg>
    );
  };
}

export const IconOverview = createIcon(
  <>
    <rect x="3" y="3" width="7" height="8" rx="1" />
    <rect x="14" y="3" width="7" height="5" rx="1" />
    <rect x="14" y="12" width="7" height="9" rx="1" />
    <rect x="3" y="15" width="7" height="6" rx="1" />
  </>,
);

export const IconApplications = createIcon(
  <path d="M3 7.5h6l2-2h10v13.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />,
);

export const IconClients = createIcon(
  <>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M3 20v-1.5A4.5 4.5 0 0 1 7.5 14h3A4.5 4.5 0 0 1 15 18.5V20" />
    <path d="M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14a4.5 4.5 0 0 1 3 4.2V20" />
  </>,
);

export const IconMailboxes = createIcon(
  <>
    <path d="M4 10h16a2 2 0 0 1 2 2v7H2v-7a2 2 0 0 1 2-2Z" />
    <path d="M7 10V7a5 5 0 0 1 10 0v3M12 2v8M2 19h20" />
  </>,
);

export const IconReviewQueue = createIcon(
  <>
    <path d="M4 4h16v16H4z" />
    <path d="M8 9h8M8 13h5M8 17h3" />
  </>,
);

export const IconCAPortfolio = createIcon(
  <>
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2" />
  </>,
);

export const IconSearch = createIcon(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-4-4" />
  </>,
);

export const IconRefresh = createIcon(
  <>
    <path d="M20 7v5h-5M4 17v-5h5" />
    <path d="M6.1 9a7 7 0 0 1 11.7-2L20 12M4 12l2.2 5a7 7 0 0 0 11.7-2" />
  </>,
);

export const IconWarning = createIcon(
  <>
    <path d="M10.3 4.3 2.5 18a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4M12 17h.01" />
  </>,
);

export const IconSuccess = createIcon(<path d="m5 12 4 4L19 6" />);
export const IconCheck = IconSuccess;

export const IconChevron = createIcon(<path d="m9 18 6-6-6-6" />);

export const IconMore = createIcon(
  <>
    <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
  </>,
);

export const IconMenu = createIcon(
  <>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </>,
);
export const IconHamburger = IconMenu;

export const IconClose = createIcon(<path d="m6 6 12 12M18 6 6 18" />);

export const IconMail = createIcon(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </>,
);

export const IconInterview = createIcon(
  <>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M8 3v4M16 3v4M3 10h18M9 16l2 2 4-4" />
  </>,
);

export const IconAssessment = createIcon(
  <>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9 4V2h6v2M9 10h6M9 14h6M9 18h4" />
  </>,
);

export const IconRejection = createIcon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="m9 9 6 6M15 9l-6 6" />
  </>,
);

export const IconArrowRight = createIcon(
  <>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </>,
);
