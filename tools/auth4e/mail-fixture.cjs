'use strict';
// Reads only synthetic messages from the AUTH-4E local SMTP mailbox.
const assert = require('node:assert/strict');
const stack = require('./stack.cjs');

async function confirmationLink(email, type = 'email') {
  assert.equal(stack.project, 'lifequest-auth4e-frontend-20261013', 'AUTHORIZED_STACK_ONLY');
  const origin = `http://127.0.0.1:${stack.ports.mail}`;
  for (let attempt = 0; attempt < 40; attempt++) {
    const listing = await (await fetch(origin + '/api/v1/messages')).json();
    for (const item of listing.messages || []) {
      if (!(item.To || []).some(to => to.Address === email)) continue;
      const message = await (await fetch(origin + '/api/v1/message/' + item.ID)).json();
      const links = (message.HTML || '').match(/href="([^"]+)"/g) || [];
      for (const attr of links) {
        const link = attr.slice(6, -1).replaceAll('&amp;', '&');
        const url = new URL(link);
        if (url.searchParams.get('type') === type && url.searchParams.has('token_hash')) {
          assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname), 'LOCAL_MAIL_LINK_REQUIRED');
          assert.equal(url.port, '31646', 'AUTH4E_APP_ORIGIN_ONLY');
          return url;
        }
      }
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('LOCAL_AUTH4E_CONFIRMATION_EMAIL_NOT_RECEIVED');
}

module.exports = { confirmationLink };
