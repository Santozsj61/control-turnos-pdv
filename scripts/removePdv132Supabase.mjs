const SB_URL = 'https://aqgfocnbsjyhcpqfxrsa.supabase.co';
const SB_KEY = 'sb_publishable_jkaQRTZe82IDDPiXTb0jMg_bj19rK0U';

const headers = {
  'apikey': SB_KEY,
  'Authorization': `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json'
};

async function removePdv132() {
  console.log('--- Removing PDV Q132 / pdv-102 from Supabase ---');

  // 1. Check & delete from users
  console.log('1. Checking users with code=Q132, username=q132, or pdv_id=pdv-102...');
  const resUsers = await fetch(`${SB_URL}/rest/v1/users?or=(code.eq.Q132,username.eq.q132,pdv_id.eq.pdv-102)`, { headers });
  const users = await resUsers.json();
  console.log('Found users:', users.map(u => ({ id: u.id, username: u.username, role: u.role, fullName: u.full_name })));

  if (Array.isArray(users) && users.length > 0) {
    const delUsers = await fetch(`${SB_URL}/rest/v1/users?or=(code.eq.Q132,username.eq.q132,pdv_id.eq.pdv-102)`, {
      method: 'DELETE',
      headers
    });
    console.log('Delete users status:', delUsers.status);
  }

  // 2. Check & delete from pdvs
  console.log('2. Checking pdvs table with code=Q132 or id=pdv-102...');
  const resPdvs = await fetch(`${SB_URL}/rest/v1/pdvs?or=(code.eq.Q132,id.eq.pdv-102)`, { headers });
  const pdvs = await resPdvs.json();
  console.log('Found pdvs:', pdvs);

  if (Array.isArray(pdvs) && pdvs.length > 0) {
    const delPdv = await fetch(`${SB_URL}/rest/v1/pdvs?or=(code.eq.Q132,id.eq.pdv-102)`, {
      method: 'DELETE',
      headers
    });
    console.log('Delete pdvs status:', delPdv.status);
  }

  // 3. Verify total pdvs count in Supabase
  const countPdvs = await fetch(`${SB_URL}/rest/v1/pdvs?select=id`, {
    headers: { ...headers, 'Prefer': 'count=exact' }
  });
  console.log('Total remaining pdvs in Supabase:', countPdvs.headers.get('content-range'));

  // 4. Verify total users count in Supabase
  const countUsers = await fetch(`${SB_URL}/rest/v1/users?select=id`, {
    headers: { ...headers, 'Prefer': 'count=exact' }
  });
  console.log('Total remaining users in Supabase:', countUsers.headers.get('content-range'));

  console.log('✅ Removal of Q132 finished successfully.');
}

removePdv132();
