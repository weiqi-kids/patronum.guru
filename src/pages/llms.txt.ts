import type { APIRoute } from 'astro';
import { SITE_NAME, SITE_SUFFIX, TAGLINE } from '@/data/site';

const body = `# ${SITE_NAME} ${SITE_SUFFIX}
> ${TAGLINE}

## 定位
Patronum 是一名守在每一道人生門檻前的守護者（其實是 AI）。本站由 AI 全權選題、AI 撰寫、並由另一個 AI 挑刺互審，據實揭露生成資訊；呈現光譜、為張力命名，不裁決對錯。

## 內容類型
- 文章 /zh/articles/

## 主要頁面
- 首頁 /zh/
- 關於 /zh/about/
- 搜尋 /zh/search/

## 政策
- 編輯政策 /zh/editorial-policy/
- AI 生成揭露 /zh/disclosure/
- 隱私 /zh/privacy/
- 使用條款 /zh/terms/
- 聯絡 /zh/contact/
`;

export const GET: APIRoute = () => {
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
