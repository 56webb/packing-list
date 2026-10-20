// 文章裡單獨一行寫 [[商品:商品id]]（或 [[product:商品id]]），build 時換成推廣商品卡片。
// 用這種「短碼」而不是 MDX，是因為 CMS（Sveltia）只編輯一般 Markdown；短碼就算被編輯器加了跳脫字元 \[ 也認得。
// 卡片內容來自 src/data/affiliate-products.json（見 src/lib/affiliate.mjs）。
import { renderProduct } from '../lib/affiliate.mjs';

const RE = /^\[\[\s*(?:商品|product)\s*[:：]\s*([a-z0-9]+(?:-[a-z0-9]+)*)\s*\]\]$/;
const text = (n) => (n.type === 'text' ? n.value : (n.children || []).map(text).join(''));

export default function remarkAffiliate() {
  return (tree, file) => {
    const fm = file.data?.astro?.frontmatter ?? {};
    const where = fm.slug ?? file.path ?? '';
    const walk = (node) => {
      (node.children || []).forEach((child, i) => {
        if (child.type === 'paragraph') {
          const m = text(child).trim().match(RE);
          if (m) {
            const { html, warning } = renderProduct(m[1]);
            if (warning) console.warn(`[推廣商品] ${where}：${warning}`);
            if (html && fm.affiliate !== true) console.warn(`[推廣商品] ${where}：文章有推廣商品卡片，但 frontmatter 沒有 affiliate: true（開頭不會顯示揭露說明）`);
            node.children[i] = { type: 'html', value: html || `<!-- 推廣商品 ${m[1]} 未顯示 -->` };
            return;
          }
        }
        walk(child);
      });
    };
    walk(tree);
  };
}
