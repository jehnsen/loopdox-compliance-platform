/**
 * Reseeds the mock database (.mock-db.json). Restart `pnpm dev` afterwards, or
 * the running server keeps its in-memory copy until it next restarts.
 */
import { resetDb } from '../mocks/store'

const db = resetDb(new Date())
console.log(
  `Mock data reseeded at ${db.meta.seededAt}: ${db.orgs.length} orgs, ${db.users.length} users.`,
)
