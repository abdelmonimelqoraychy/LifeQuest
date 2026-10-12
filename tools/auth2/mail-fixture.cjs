'use strict';
// Local SMTP fixture only. Message bodies and link credentials stay in memory.
const assert = require('node:assert/strict');
async function confirmationLink(email, type = 'email') {
  for (let attempt = 0; attempt < 40; attempt++) {
    const listing = await (await fetch('http://127.0.0.1:54324/api/v1/messages')).json();
    for (const item of listing.messages || []) {
      if (!(item.To || []).some(to => to.Address === email)) continue;
      const message = await (await fetch('http://127.0.0.1:54324/api/v1/message/' + item.ID)).json();
      const links = (message.HTML || '').match(/href="([^"]+)"/g) || [];
      for (const attr of links) {
        const link = attr.slice(6, -1).replaceAll('&amp;', '&');
        const url = new URL(link);
        if (url.searchParams.get('type') === type && url.searchParams.has('token_hash')) {
          assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname), 'LOCAL_MAIL_LINK_REQUIRED');
          return url;
        }
      }
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('LOCAL_CONFIRMATION_EMAIL_NOT_RECEIVED');
}
module.exports = { confirmationLink };
