import { one } from "../db";

export interface DemoState {
  seeded: boolean;
  seededAt: string | null;
}

/**
 * Some preview deployments are seeded with demo content. This flag lets the UI
 * say so plainly instead of letting fixtures look like real campus activity.
 */
export async function getDemoState(): Promise<DemoState> {
  const row = await one<{ value: { seeded?: boolean; seededAt?: string } }>(
    "select value from settings where key = 'demo'",
  );
  return {
    seeded: row?.value?.seeded === true,
    seededAt: typeof row?.value?.seededAt === "string" ? row.value.seededAt : null,
  };
}
