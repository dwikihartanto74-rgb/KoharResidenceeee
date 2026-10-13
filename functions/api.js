/**
 * KoharResidence — Cloudflare Pages Function
 * Endpoint: POST /api
 * Google Apps Script remains the backend; Google Spreadsheet remains the database.
 * Set GAS_WEB_APP_URL in Cloudflare Pages environment variables to the deployed
 * Apps Script Web App URL ending in /exec.
 */
const ALLOWED_ACTIONS = new Set([
  'login', 'register', 'logout', 'requestOTP', 'verifyOTP', 'resetPassword',
  'getDashboardData', 'getTableData', 'getPublicRooms', 'getServerNowWIB',
  'getTagihanTargets', 'getTagihanTargetsData', 'saveModuleData', 'saveKamar',
  'saveKamarData', 'savePenghuni', 'saveTagihan', 'saveListrikAir',
  'savePengeluaran', 'savePengumuman', 'saveUserAdmin', 'hapusData',
  'uploadPembayaran', 'verifikasiPembayaran', 'getMyProfile',
  'saveMyProfilePhoto', 'removeMyProfilePhoto', 'submitUserComplaint',
  'getMyComplaints', 'getAllComplaintsForAdmin', 'getComplaintConversation',
  'sendComplaintReply', 'sendComplaintMedia', 'setComplaintStatus'
]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'GET') {
    return json({ success: true, message: 'KoharResidence Pages API aktif.', data: { status: 'online' } });
  }
  if (request.method !== 'POST') {
    return json({ success: false, message: 'Metode HTTP tidak diizinkan.', data: null }, 405);
  }

  const gasUrl = String(env.GAS_WEB_APP_URL || '').trim();
  if (!gasUrl || !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec(?:\?.*)?$/.test(gasUrl)) {
    return json({ success: false, message: 'Konfigurasi GAS_WEB_APP_URL belum benar.', data: null }, 500);
  }

  let payload;
  try {
    const raw = await request.text();
    if (!raw || raw.length > 10_000_000) {
      return json({ success: false, message: 'Isi permintaan kosong atau melebihi batas 10 MB.', data: null }, 413);
    }
    payload = JSON.parse(raw);
  } catch (_) {
    return json({ success: false, message: 'Format permintaan JSON tidak valid.', data: null }, 400);
  }

  const action = typeof payload.action === 'string' ? payload.action.trim() : '';
  const args = Array.isArray(payload.args) ? payload.args : null;
  if (!ALLOWED_ACTIONS.has(action)) {
    return json({ success: false, message: 'Aksi API tidak diizinkan.', data: null }, 403);
  }
  if (!args) {
    return json({ success: false, message: 'Parameter args harus berupa array.', data: null }, 400);
  }

  try {
    // text/plain avoids unnecessary content-type preflight; this is a server-side
    // request from Pages Functions to Apps Script, not a browser cross-origin call.
    const upstream = await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, args }),
      redirect: 'follow'
    });

    const body = await upstream.text();
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch (_) {
      return json({
        success: false,
        message: 'Apps Script mengembalikan respons bukan JSON. Periksa deployment Web App dan aksesnya.',
        data: null
      }, 502);
    }

    // Some existing Apps Script functions already return {success,message,data}.
    // doPost currently wraps those results once more. Unwrap that one extra layer
    // here so the original frontend continues to receive the response shape it expects.
    if (parsed && parsed.success === true && parsed.data &&
        typeof parsed.data === 'object' &&
        typeof parsed.data.success === 'boolean' &&
        Object.prototype.hasOwnProperty.call(parsed.data, 'data')) {
      parsed = parsed.data;
    }

    // Keep the Apps Script response contract intact for the existing frontend.
    return json(parsed, upstream.ok ? 200 : 502);
  } catch (error) {
    // Do not expose internal URLs or stack traces to visitors.
    return json({
      success: false,
      message: 'Tidak dapat terhubung ke backend Google Apps Script.',
      data: null
    }, 502);
  }
}
