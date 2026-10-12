# SideStore配布ソース

SideStoreのSourcesで「＋」を押し、次のURLを登録します。

https://raw.githubusercontent.com/kuretoshi/BetterCrewlink-mobile_fix/voice_effect/distribution/sidestore.json

Browseで「Tanuki BCL Mobile」を選べます。既に同じApple Accountで署名しているアプリは、削除せず更新してください。無料署名の期限更新と、アプリのバージョン更新は別の操作です。Wi-FiとLocalDevVPNを接続し、新版のUpdateを実行します。アプリ自身での更新インストールは行いません。

## 次回の公開手順

1. 最新のモバイル修正を取り込み、iOS向けのバージョン・ビルド番号を更新します。
2. docs/ios-development.mdに従って署名無しIPAをビルドし、テストします。
3. IPAを対象のGitHubリリースへアップロードします。
4. 次のコマンドで配布ソースを更新し、distribution/sidestore.jsonをvoice_effectへコミットします。日付は公開日を指定してください。

```sh
python3 scripts/update-sidestore-source.py /path/to/TanukiBCL-Mobile-iOS-3.18-SideStore.ipa v3.18 2026-10-12
```

登録URLとbundleIdentifierは変えず、versionsの先頭を新版にします。ダウンロードURLはバージョンごとのリリースを指し、IPAのサイズとInfo.plistのバージョン・対象OSを自動で反映します。Androidだけのリリースが出ても、このソースは直前のiOS版を維持します。IPAの公開前にJSONを公開しないでください。

SideStore上でのソース追加・更新操作は実機での確認が必要です。既存の3.16.0はSideStore経由でインストール・起動を確認済みですが、配布ソース経由の更新は未確認です。

参考: [SideStoreのApp Sources](https://docs.sidestore.io/docs/advanced/app-sources)、[SideStoreのソース仕様](https://github.com/SideStore/sidestore-source-types)。
