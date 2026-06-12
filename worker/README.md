# patronum-api（Cloudflare Worker + D1）

留言與「提議新門檻」的後端。純 Workers + D1，無第三方，讀者不用帳號就能留言。

## 一次性部署（在你自己的機器上，用你的 Cloudflare 帳號）

```bash
cd worker
pnpm install
pnpm exec wrangler login                  # 瀏覽器授權一次

# 1) 建 D1 資料庫，把回傳的 database_id 貼進 wrangler.jsonc 的 database_id
pnpm exec wrangler d1 create patronum

# 2) 建表
pnpm exec wrangler d1 migrations apply patronum --remote

# 3) 設管理密鑰（自己想一組長字串，之後刪壞留言／看提議要用）
pnpm exec wrangler secret put ADMIN_TOKEN

# 守護者問答用的 Anthropic 金鑰
pnpm exec wrangler secret put ANTHROPIC_API_KEY

# 4) 部署，記下印出來的網址 https://patronum-api.<你的子網域>.workers.dev
pnpm exec wrangler deploy
```

## 把後端接到網站（一個變數）

在 GitHub repo `weiqi-kids/patronum.guru` 設一個 repo 變數：

```bash
gh variable set PATRONUM_API_URL -b "https://patronum-api.<你的子網域>.workers.dev"
```

然後重跑一次 Pages 部署（push 或手動觸發 workflow）。前端就會用它打留言 API。
沒設這個變數時，網站照常運作，留言區會顯示「留言功能即將開放」。

## 管理（用 ADMIN_TOKEN）

```bash
# 看所有「提議新門檻」
curl -H "Authorization: Bearer <ADMIN_TOKEN>" https://patronum-api.<子網域>.workers.dev/api/topics

# 隱藏一則壞留言（id 從留言看）
curl -X DELETE -H "Authorization: Bearer <ADMIN_TOKEN>" https://patronum-api.<子網域>.workers.dev/api/comments/<id>
```

## 端點

| 方法 | 路徑 | 權限 | 用途 |
|------|------|------|------|
| GET | `/api/comments?slug=` | 公開 | 讀某篇留言 |
| POST | `/api/comments` | 公開 | 留言 `{slug,name?,body,website?}` |
| POST | `/api/topics` | 公開 | 提議新門檻 `{title,note?,website?}` |
| GET | `/api/topics` | 管理 | 看所有提議 |
| DELETE | `/api/comments/:id` | 管理 | 隱藏留言 |
| POST | `/api/ask` | 公開 | 問當前文章 `{slug,question,context}` → `{answer}` |

防濫用：欄位長度上限、同 IP 每分鐘最多 5 則、蜜罐欄位 `website`、IP 只存雜湊不存原值。
