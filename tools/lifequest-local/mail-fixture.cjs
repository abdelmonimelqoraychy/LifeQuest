'use strict';
const assert=require('node:assert/strict'),stack=require('./stack.cjs');
async function confirmationLink(email,type='email'){
 assert.equal(stack.project,'lifequest-personal-local-20261014');const origin=`http://127.0.0.1:${stack.ports.mailpit}`;
 for(let i=0;i<60;i++){const listing=await(await fetch(origin+'/api/v1/messages')).json();for(const item of listing.messages||[]){if(!(item.To||[]).some(to=>to.Address===email))continue;const message=await(await fetch(origin+'/api/v1/message/'+item.ID)).json();for(const attr of(message.HTML||'').match(/href="([^"]+)"/g)||[]){const link=attr.slice(6,-1).replaceAll('&amp;','&'),url=new URL(link);if(url.searchParams.get('type')===type&&url.searchParams.has('token_hash')){assert.ok(['127.0.0.1','localhost'].includes(url.hostname));assert.equal(url.port,'31770');return url;}}}await new Promise(r=>setTimeout(r,150));}
 throw Error('LOCAL_SYNTHETIC_CONFIRMATION_NOT_RECEIVED');
}
module.exports={confirmationLink};
