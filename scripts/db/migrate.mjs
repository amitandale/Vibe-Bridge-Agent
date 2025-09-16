// scripts/db/migrate.mjs
import { migrate } from '../../lib/db/migrate.mjs';
const res = migrate({});
console.log(JSON.stringify(res));
