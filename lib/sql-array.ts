import { sql, type SQL } from 'drizzle-orm';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A list of UUIDs as ONE Postgres uuid[] parameter, for `= ANY(...)`.
 *
 * Don't write `ANY(${ids}::uuid[])`: Drizzle expands a JS array into
 * `($1, $2)`, which Postgres can't cast to uuid[] ("malformed array
 * literal" / "cannot cast type record"). That broke checkout.
 */
export function uuidArray(ids: Iterable<string>): SQL {
  const list = Array.from(ids).filter((id) => UUID_RE.test(id));
  return sql`${'{' + list.join(',') + '}'}::uuid[]`;
}
