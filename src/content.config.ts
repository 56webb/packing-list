// 部落格文章的「內容集合」（Content Collection）設定
// - 每篇文章一個資料夾：src/content/blog/<slug>/post.md ＋ images/
// - frontmatter 的 slug 會變成網址：/zh-tw/blog/<slug>/
// - schema 是「格式檢查」：少了 title、日期格式錯，npm run build 就會報錯，避免上線才發現
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const blog = defineCollection({
  loader: glob({ pattern: '*/post.md', base: './src/content/blog' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      pubDate: z.coerce.date(),
      updatedDate: z.coerce.date().optional(),
      tags: z.array(z.string()).default([]),
      cover: image().optional(),
      country: z.string().optional(),
      slug: z.string(),
      // 文章裡有推廣（分潤）連結時設成 true，版面會自動在文章開頭顯示揭露說明
      affiliate: z.boolean().default(false),
      draft: z.boolean().default(false),
    }),
});

export const collections = { blog };
