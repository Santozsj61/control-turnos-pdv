const SB_URL = 'https://aqgfocnbsjyhcpqfxrsa.supabase.co';
const SB_KEY = 'sb_publishable_jkaQRTZe82IDDPiXTb0jMg_bj19rK0U';

async function checkTable(table) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}?select=id`, {
    headers: {
      'apikey': SB_KEY,
      'Authorization': `Bearer ${SB_KEY}`,
      'Prefer': 'count=exact'
    }
  });
  const count = res.headers.get('content-range');
  const data = await res.json();
  console.log(`${table}: status=${res.status}, rangeHeader=${count}, returnedLength=${Array.isArray(data) ? data.length : JSON.stringify(data)}`);
}

async function run() {
  await checkTable('schedules');
  await checkTable('punch_records');
  await checkTable('punch_batches');
  await checkTable('permissions');
  await checkTable('supplementary_justifications');
  await checkTable('users');
}
run();
