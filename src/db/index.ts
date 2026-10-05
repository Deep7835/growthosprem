import "server-only";
import { withOrg as withOrgOn, type Db, type Tx } from "./core";
import { getSystemDb } from "./system";

export type { Db, Tx };
export { getSystemDb };

export async function withOrg<T>(orgId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withOrgOn(await getSystemDb(), orgId, fn);
}
