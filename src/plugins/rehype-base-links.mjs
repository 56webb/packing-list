// 讓 Markdown 裡寫的站內連結（例如 /zh-tw/blog/visit-japan-web/）自動加上 base。
// GitHub Pages 的 base 是 /packing-list，所以會變成 /packing-list/zh-tw/blog/...；
// base 是 / 的時候（Vercel 預覽、之後的自訂網域）就不變。這樣文章裡只要寫一種連結。
export default function rehypeBaseLinks(base = '/') {
  const prefix = base.replace(/\/$/, '');
  const walk = (node) => {
    if (node.type === 'element' && node.tagName === 'a') {
      const href = node.properties?.href;
      if (typeof href === 'string' && href.startsWith('/') && !href.startsWith('//') && prefix && !href.startsWith(prefix + '/')) {
        node.properties.href = prefix + href;
      }
    }
    (node.children || []).forEach(walk);
  };
  return () => (tree) => walk(tree);
}
