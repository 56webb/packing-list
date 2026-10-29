// Vercel Function（Node.js runtime）：藍新金流所有 API 都走這一支。
// 路由與邏輯在 lib/newebpay/router.js；vercel.json 的 rewrites 把 /api/newebpay/* 轉到這裡。
// 這個檔案只在 Vercel 上執行；GitHub Pages 版本沒有後端，付款功能不會運作。
import { handle } from '../lib/newebpay/router.js';

export default {
  fetch(request) {
    return handle(request);
  },
};
