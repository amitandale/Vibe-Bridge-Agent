#!/usr/bin/env node
import { applyAll } from '../../lib/db/migrate.mjs';
try {
  await applyAll();
  console.log('migrations applied');
  process.exit(0);
} catch (e) {
  console.error('migrations failed', e);
  process.exit(2);
}
