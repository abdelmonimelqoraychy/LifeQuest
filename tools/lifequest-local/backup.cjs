'use strict';

// Stable simple command retained for documentation and existing callers.
// This is the unencrypted PostgreSQL custom-format backup path.
const { runPersonalBackup, formatBackupError } = require('./plain-backup.cjs');

if (require.main === module) runPersonalBackup().catch(error => {
  console.error(formatBackupError(error?.code));
  process.exitCode = 1;
});

module.exports = { runPersonalBackup };
