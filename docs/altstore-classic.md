# AltStore Classicでのインストール・更新

配布ソースURL:

https://raw.githubusercontent.com/kuretoshi/BetterCrewlink-mobile_fix/voice_effect/distribution/altstore.json

1. [macOSの公式ガイド](https://faq.altstore.io/altstore-classic/how-to-install-altstore-macos)または[Windowsの公式ガイド](https://faq.altstore.io/altstore-classic/how-to-install-altstore-windows)に従い、MacまたはWindowsのAltServerでiPhoneへAltStore Classicをインストールします。
2. AltStore ClassicのSources画面から「＋」で上記URLを追加します。
3. Browseで「Tanuki BCL Mobile」を選び、利用者自身のApple Accountで署名してインストールします。更新時も同じApple Accountを使用してください。
4. インストール・更新・署名期限の更新時には、AltServerへ接続できる状態にしてください。環境に応じてUSB接続またはWi-Fi同期を使います。

IPAを直接保存しMy Appsの「＋」で選択する方法も利用できます。v3.19のIPAはSideStoreとAltStore Classicで共通です。SideStoreから移行する際は既存アプリの設定を控え、アプリを削除する前にデータを確認してください。移行時のデータ維持は未確認です。

iOS版は試験版です。3.19.0のAltStore Classic実機インストール・更新と、Among Usを同じiPhoneで開いた間の通話継続は未検証です。

## 次回の公開

iOS対応ソースはリリース添付の `TanukiBCL-Mobile-iOS-3.19-source.zip` に含まれています。自動生成のSource code ZIPにはiOSプロジェクトが入っていません。

1. ソースZIPのdocs/ios-development.mdに従い、最新版に対応した署名無しIPAをビルドして検証します。
2. バージョンごとのGitHubリリースへIPAをアップロードします。
3. 次の生成スクリプトを実行します（公開日を指定）。

```sh
python3 scripts/update-sidestore-source.py /path/to/TanukiBCL-Mobile-iOS-3.19.ipa v3.19 2026-10-16
```

4. distribution/sidestore.json と distribution/altstore.json をvoice_effectへ公開します。登録済みURLは変更しません。

スクリプトはIPA内Info.plistからバージョン、ビルド番号、最低OS、プライバシー権限を読み取ります。署名無しIPAには追加entitlementsがないため、AltStore Classicには空の配列を宣言します。署名済みIPAは使わないでください。

ソース仕様: [AltStore公式 Make a Source](https://faq.altstore.io/developers/make-a-source)。AltStore PALの公証配布は対象に含みません。
