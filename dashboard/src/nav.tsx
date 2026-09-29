import { createContext, useContext } from 'react';
import type { IconName } from './icons';
import type { StringKey } from './i18n';

export type Route = 'overview' | 'members' | 'memberships' | 'venues' | 'plan' | 'themes' | 'notifications' | 'redeem';

/** What a page should open when it is reached from search (a member, a venue, a code). */
export type Intent = { memberId?: string; venueId?: string; code?: string } | null;

export type NavItem = { route: Route; icon: IconName; label: StringKey; hint: StringKey; staff?: boolean };

export const NAV_GROUPS: { label: StringKey; items: NavItem[] }[] = [
  { label: 'navMain', items: [{ route: 'overview', icon: 'overview', label: 'overview', hint: 'overviewHint' }] },
  {
    label: 'navContent',
    items: [
      { route: 'venues', icon: 'ticket', label: 'venues', hint: 'venuesHint' },
      { route: 'plan', icon: 'tag', label: 'plan', hint: 'planHint' },
      { route: 'themes', icon: 'palette', label: 'themes', hint: 'themesHint' },
    ],
  },
  {
    label: 'navPeople',
    items: [
      { route: 'members', icon: 'users', label: 'members', hint: 'membersHint' },
      { route: 'memberships', icon: 'crown', label: 'memberships', hint: 'membershipsHint' },
    ],
  },
  { label: 'navEngage', items: [{ route: 'notifications', icon: 'bell', label: 'notifications', hint: 'notificationsHint' }] },
  { label: 'navOps', items: [{ route: 'redeem', icon: 'scan', label: 'redeem', hint: 'redeemHint', staff: true }] },
];

export const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

type Nav = {
  route: Route;
  navigate: (route: Route, intent?: Intent) => void;
  intent: Intent;
  /** Pages call this once they have acted on the intent. */
  clearIntent: () => void;
};

export const NavContext = createContext<Nav>({ route: 'overview', navigate: () => {}, intent: null, clearIntent: () => {} });

export const useNav = () => useContext(NavContext);
