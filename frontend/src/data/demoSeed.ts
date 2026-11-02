// Demo mode: no Supabase, data in memory, nothing saved. The plan starts empty, like the real one.
// Sign in as "lucia" (admin) or "socio" (read-only), password demo2026pass.
import type { Seed } from './memoryRepo';
import { rulesSeed } from './rulesSeed';

export const DEMO_PASSWORD = 'demo2026pass';

export function demoSeed(): Seed {
  return {
    users: [
      { username: 'lucia', fullName: 'Lucia De Mojà', role: 'admin', password: DEMO_PASSWORD },
      { username: 'socio', fullName: 'Socio (sola lettura)', role: 'viewer', password: DEMO_PASSWORD },
    ],
    rules: rulesSeed(),
  };
}
