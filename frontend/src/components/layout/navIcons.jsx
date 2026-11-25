function Icon({ children }) { return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[22px] w-[22px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>; }
export const NAV_ICONS = {
  dashboard: <Icon><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></Icon>,
  queue: <Icon><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></Icon>,
  prescriptions: <Icon><path d="M7 21V3h5a5 5 0 0 1 0 10H7m5 0 6 8"/></Icon>,
  patients: <Icon><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></Icon>,
  lab: <Icon><path d="M9 3h6m-5 0v7l-5 9a1 1 0 0 0 1 2h12a1 1 0 0 0 1-2l-5-9V3"/><path d="M8 16h8"/></Icon>,
};
