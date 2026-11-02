import type { Repo } from '../data/repo';
import type { DateStr } from '../lib/dates';
import type { Farm } from '../lib/plan';
import type { Route } from '../lib/route';

/** What every page gets from the app. */
export type PageProps = { repo: Repo; farm: Farm; isAdmin: boolean; today: DateStr; go: (r: Route) => void };
