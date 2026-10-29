// 藍新金流 API 路由（被 api/newebpay.js 使用）。
// 網址（vercel.json 會把 /api/newebpay/<路徑>/ 轉到同一個 Function）：
//   GET  /api/newebpay/status/          看設定狀態（不會顯示金鑰）
//   POST /api/newebpay/create-order/    建立一次付清訂單 → 回傳要 Form Post 到藍新的欄位
//   POST /api/newebpay/notify/          藍新幕後通知（NotifyURL）
//   POST /api/newebpay/return/          付款後瀏覽器被導回（ReturnURL）→ 轉到結果頁
//   POST /api/newebpay/period/create/   建立定期定額委託
//   POST /api/newebpay/period/notify/   定期定額通知（建立完成＋每期授權）
//   POST /api/newebpay/period/return/   定期定額建立完成導回 → 轉到結果頁
import { getConfig } from './config.js';
import { getPlan, makeOrderNo } from './plans.js';
import { buildMpgForm, decodeMpgResponse, handleMpgNotify } from './mpg.js';
import { buildPeriodForm, decodePeriod, handlePeriodNotify } from './period.js';
import { getStore } from './store.js';

const json = (status, data) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

/** 讀表單：urlencoded 和 multipart 都支援（定期定額手冊 §6 提到兩種都可能出現） */
async function readForm(request) {
  const type = request.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    try { return await request.json(); } catch { return {}; }
  }
  try {
    const fd = await request.formData();
    const out = {};
    for (const [k, v] of fd.entries()) if (typeof v === 'string') out[k] = v;
    return out;
  } catch {
    return {};
  }
}

function routeOf(request) {
  const url = new URL(request.url);
  const q = url.searchParams.get('route');
  const raw = q ?? url.pathname.replace(/^\/api\/newebpay\/?/, '');
  return raw.replace(/^\/+|\/+$/g, '');
}

const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;

function urls(cfg, request) {
  const origin = cfg.publicUrl || new URL(request.url).origin;
  const site = origin.replace(/\/+$/, '');
  return {
    notify: `${site}/api/newebpay/notify/`,
    ret: `${site}/api/newebpay/return/`,
    periodNotify: `${site}/api/newebpay/period/notify/`,
    periodReturn: `${site}/api/newebpay/period/return/`,
    back: `${site}/zh-tw/pricing/`,
  };
}

function redirectToResult(cfg, params) {
  const qs = new URLSearchParams(params).toString();
  return new Response(null, { status: 303, headers: { location: `${cfg.resultPath}?${qs}`, 'cache-control': 'no-store' } });
}

export async function handle(request, { env = process.env, store = getStore(), log = console } = {}) {
  const route = routeOf(request);
  const cfg = getConfig(env);

  if (route === 'status') {
    return json(200, { configured: cfg.ok, missing: cfg.missing, mode: cfg.mode, store: store.kind });
  }
  if (request.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });
  if (!cfg.ok) {
    log.error('[newebpay] 尚未設定環境變數', cfg.missing);
    return json(503, { ok: false, error: 'not_configured', message: '金流尚未設定' });
  }

  try {
    switch (route) {
      case 'create-order':
      case 'period/create': {
        const body = await readForm(request);
        const plan = getPlan(String(body.planId || ''));
        const wantType = route === 'create-order' ? 'one_time' : 'subscription';
        if (!plan || plan.type !== wantType) return json(400, { ok: false, error: 'unknown_plan' });
        if (body.agree !== true && body.agree !== 'true' && body.agree !== 'on') {
          return json(400, { ok: false, error: 'consent_required', message: '請先勾選同意服務條款與退款政策' });
        }
        const email = String(body.email || '').trim();
        if (email && !EMAIL_RE.test(email)) return json(400, { ok: false, error: 'bad_email' });
        if (wantType === 'subscription' && !email) return json(400, { ok: false, error: 'email_required' });
        const u = urls(cfg, request);
        const orderNo = makeOrderNo(plan);
        await store.saveOrder({ merchantOrderNo: orderNo, planId: plan.id, amount: plan.priceTwd, email, status: 'pending', createdAt: new Date().toISOString() });
        if (wantType === 'one_time') {
          const fields = buildMpgForm(cfg, { plan, orderNo, email, returnUrl: u.ret, notifyUrl: u.notify, clientBackUrl: u.back });
          return json(200, { ok: true, mode: cfg.mode, orderNo, action: cfg.gateway.mpg, fields });
        }
        const fields = buildPeriodForm(cfg, { plan, orderNo, email, returnUrl: u.periodReturn, notifyUrl: u.periodNotify, backUrl: u.back });
        return json(200, { ok: true, mode: cfg.mode, orderNo, action: cfg.gateway.period, fields });
      }
      case 'notify': {
        const r = await handleMpgNotify(cfg, await readForm(request), store, log);
        return json(r.httpStatus, r.body);
      }
      case 'period/notify': {
        const r = await handlePeriodNotify(cfg, await readForm(request), store, log);
        return json(r.httpStatus, r.body);
      }
      case 'return': {
        // ReturnURL 只是把人帶回網站，不能拿來判定付款成功（手冊 §6：以 NotifyURL 為準）
        const d = decodeMpgResponse(cfg, await readForm(request));
        if (!d.ok) return redirectToResult(cfg, { type: 'mpg', status: 'error' });
        return redirectToResult(cfg, { type: 'mpg', status: d.status === 'SUCCESS' ? 'success' : 'fail', order: d.result.MerchantOrderNo || '' });
      }
      case 'period/return': {
        const d = decodePeriod(cfg, await readForm(request));
        if (!d.ok) return redirectToResult(cfg, { type: 'period', status: 'error' });
        return redirectToResult(cfg, { type: 'period', status: d.status === 'SUCCESS' ? 'success' : 'fail', order: d.result.MerchantOrderNo || '' });
      }
      default:
        return json(404, { ok: false, error: 'not_found' });
    }
  } catch (err) {
    log.error('[newebpay] 錯誤', err && err.message);
    return json(500, { ok: false, error: 'server_error' });
  }
}
