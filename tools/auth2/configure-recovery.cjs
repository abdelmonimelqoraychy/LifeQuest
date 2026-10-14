'use strict';
// Add only the missing AUTH-3 signing key; preserve every existing variable.
const fs = require('node:fs'); const path = require('node:path'); const {randomBytes} = require('node:crypto');
const file = path.resolve(__dirname, '../../frontend/.env.local');
const content = fs.readFileSync(file, 'utf8');
if (/^AUTH_RECOVERY_SECRET=/m.test(content)) { console.log('Existing recovery key preserved; value suppressed.'); }
else { fs.appendFileSync(file, '\nAUTH_RECOVERY_SECRET=' + randomBytes(48).toString('hex') + '\n'); console.log('Missing recovery signing key generated locally; value suppressed.'); }
