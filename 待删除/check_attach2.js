const http = require('http');
const t = require('./node_modules/jsonwebtoken');
const token = t.sign({userId:'u1',userName:'admin',accountSetId:'0909197f-5984-47a7-860a-8cb095a7ec32',roleId:'admin',permissions:['*']},'cw-finance-secret-key-change-in-production',{expiresIn:'8h'});

function get(path) {
  return new Promise((resolve, reject) => {
    const url = new URL('http://localhost:3005' + path);
    http.get(url, {headers: {Authorization: 'Bearer ' + token}}, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve(d); } });
    }).on('error', reject);
  });
}

async function main() {
  // get all vouchers
  const list = await get('/api/voucher/vouchers?page=1&pageSize=5');
  console.log('Total:', list.data ? list.data.length : 0);
  if (list.data && list.data.length > 0) {
    const v = list.data[0];
    console.log('First voucher:', v.id, v.voucher_no, v.voucher_date);
    const att = await get('/api/voucher/vouchers/' + v.id + '/attachments');
    console.log('Attachments:', JSON.stringify(att, null, 2));
  }
}
main();
