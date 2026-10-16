# Safe Web Proxy

個人用の閲覧補助・開発検証向けの、制約付きHTTP/HTTPS Webプロキシです。Node.js 20、TypeScript、Expressを使い、フロントエンドはビルド不要のHTMLです。

## 設計とリクエストの流れ

1. トップページのフォームが `/proxy?url=...` に遷移します。
2. URLの形式・スキーム・資格情報を検査し、DNS解決後の全アドレスが公開アドレスか調べます。
3. 検査済みのIPアドレスに接続を固定します。リダイレクトも上限回数まで、移動先ごとに同じ検査をします。
4. HTMLのリンク、画像、スクリプト、フォーム等のURL属性とCSSの `url()` / `@import` を、対象ページを基準に `/proxy?url=...` に書き換えます。
5. HTMLとCSSは宣言された文字コードでデコードします。他の応答はバイト列をそのまま転送します。応答本文は設定した上限までメモリに読み込みます。

対象サイトからのCookie、Authorization、Set-Cookie、Refererは転送・保存しません。HTMLレスポンスにはsandbox CSPを付けます。任意の公開URLを取得できる仕組みなので、信頼できる利用者だけがアクセスできる環境で使ってください。公開インターネットへ直接公開する用途には向きません。

## ディレクトリ構成

```text
safe-web-proxy/
├── public/index.html       # 入力フォーム
├── src/
│   ├── config.ts           # 環境設定
│   ├── proxy.ts            # DNS検査済みIPへ接続し、リダイレクトを処理
│   ├── rewrite.ts          # HTML/CSSと文字コード処理
│   ├── security.ts         # URL・IP検査
│   └── server.ts           # Expressアプリ、レート制限
├── .dockerignore
├── .env.example
├── .gitignore
├── Dockerfile
├── docker-compose.yml
├── package.json
└── tsconfig.json
```

## ローカルで起動

Node.js 20以上とnpmが必要です。

```sh
npm install
npm run build
npm start
```

ブラウザで `http://localhost:3000` を開きます。開発時は `npm run dev` も使えます。

## Dockerで起動

```sh
docker compose up --build
```

停止は `docker compose down` です。

## 設定

`.env.example` は利用可能な設定一覧です。Node.js起動時に `.env` を自動読込する仕組みは含めていないため、ローカルでは環境変数として設定してください。Docker Composeの値は `docker-compose.yml` で変更できます。

| 環境変数 | 既定値 | 説明 |
|---|---:|---|
| `PORT` | `3000` | 待受ポート |
| `HOST` | `0.0.0.0` | 待受アドレス |
| `REQUEST_TIMEOUT_MS` | `10000` | 対象サーバーへのタイムアウト |
| `MAX_RESPONSE_BYTES` | `10485760` | 応答本文の最大バイト数（10 MiB） |
| `MAX_REDIRECTS` | `5` | 最大リダイレクト数 |
| `RATE_LIMIT_WINDOW_MS` | `60000` | IP別レート制限の期間 |
| `RATE_LIMIT_MAX` | `30` | 期間中に許可するリクエスト数/IP |

## 動作確認手順

起動してトップページを開き、次のURLをフォームへ入力します。

- `https://example.com/` — 基本的なHTML取得
- `https://www.iana.org/domains/reserved` — 内部リンクの書き換え
- `https://example.com/robots.txt` — テキスト応答のバイト転送
- `http://127.0.0.1/` — SSRF対策により拒否されること
- `file:///etc/passwd` — HTTP/HTTPS以外として拒否されること

開発者ツールのネットワーク欄で、HTML内リンクや画像のリクエストが `/proxy?url=...` に向くことを確認できます。

## ログとプライバシー

ログにはプロキシのパス（`/proxy`）と結果ステータスのみを出し、対象URL、IP、Cookie、認証情報は記録しません。アクセス元IPを使ってレート制限します。プロキシ先のCookieを保持せず、リクエストにも送信しません。

## 既知の制限事項

- JavaScriptで実行時に生成されるURLやService Worker、WebSocket、動的なAPI通信は書き換えられません。
- Cookieが必要なログインサイト、認証が必要なページ、POSTフォーム、アップロード処理には対応しません。
- HTML/CSS以外は文字コードや本文を書き換えず転送します。大きなファイルは10 MiB上限を超えると中断し、本文をメモリに保持するためストリーミング転送ではありません。
- `srcset` の複雑な書式、CSS内の特殊なエスケープ表現、JavaScript内のURLは完全には解析しません。
- sandbox/CSPにより、対象ページの機能や表示が元ページと異なる場合があります。
- IP別レート制限はインメモリで、複数インスタンス間では共有されません。リバースプロキシ配下で使う場合、信頼できるプロキシを明示してからExpressの `trust proxy` を設定してください。
- ターゲット応答のContent-Length、Range、Set-Cookie等の一部ヘッダーは転送しません。

## GitHubへアップロード

このフォルダをGitリポジトリとして初期化し、GitHubで作成した空のリポジトリをremoteに設定してpushします。`node_modules`、ビルド出力、`.env` は `.gitignore` で除外されています。

```sh
git init
git add .
git commit -m "Add safe web proxy"
git branch -M main
git remote add origin https://github.com/USER/REPOSITORY.git
git push -u origin main
```

公開前に、利用者を限定するネットワーク制御を必ず行ってください。
