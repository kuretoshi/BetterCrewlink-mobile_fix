# モバイル問い合わせの受付サーバー設定

クライアントは既存の `https://debug-auth.kuretoshi.work/v1/inquiries` に
`product=mobile`、`public_issue_consent=true` と添付ログを送信します。
GitHub/Discordの資格情報はクライアントに含めません。

## 適用

既存のGitHub Issue・Discordフォーラム連携が稼働しているサーバーが対象です。
APIとDiscordブリッジを停止した保守時間に、配備済みファイルとDBのバックアップを
取得してから `enable_mobile.py` を実行してください。このスクリプトも変更前の
ファイル・SQLiteバックアップを作成します。

```sh
python3 enable_mobile.py --root /opt/tanuki-debug-auth \
  --database /var/lib/tanuki-debug-auth/auth.sqlite3 --forum-source tanuki
```

`--forum-source` はモバイル報告を投稿する既存の「バグ報告＆要望」フォーラムに
対応する製品を指定します。専用フォーラムを使用する場合は複製後にモバイル用の
Webhookとタグを `auth.py webhook-set mobile` で設定してください。
Webhook URLやトークンをチャット・リポジトリに書かないでください。

APIとDiscordブリッジの両サービスに次を設定します。

```ini
INQUIRY_GITHUB_REPO_MOBILE=kuretoshi/BetterCrewlink-mobile_fix
```

モバイル用の `INQUIRY_GITHUB_TOKEN_MOBILE`、または既存の共通
`INQUIRY_GITHUB_TOKEN` に上記リポジトリのIssue書込み権限が必要です。
既存の `INQUIRY_GITHUB_REPO_NET` や `INQUIRY_GITHUB_TOKEN_NET` は保持します。
専用Discordフォーラムを新規投稿の自動取込対象にもする場合だけ、両サービスに
`INQUIRY_DISCORD_FORUM_ID_MOBILE` を設定します。同じフォーラムIDを複数製品へ
設定すると既存ブリッジは起動を拒否するため、共有フォーラムでは追加しません。

APIとブリッジを再起動し、ブラウザOrigin付きのOPTIONS応答に
`Access-Control-Allow-Origin: *` が付くことを確認してください。
送信内容は公開されるため、外部への試験投稿は確認可能なテスト内容で実施し、
Issueのリンク、ログ添付、Discordへの反映を確認します。

APIはIssue作成後にDiscord転送を行い、Discordに一時障害があれば既存Botが再試行します。
クライアントはモバイル用Issue URLを確認した時点で受付成功と表示します。

## テスト

```sh
python3 -m unittest discover -s server/inquiries
```

2026-11-01に既存サーバーへ適用し、モバイル用Issue #2および
モバイルカテゴリのDiscord「バグ報告＆要望」へのログ付き送信を確認しました。
モバイル用フォーラムIDは `1508089571106361465` です。
