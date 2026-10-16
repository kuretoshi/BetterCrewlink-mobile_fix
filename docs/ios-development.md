# iOS版の開発と検証

## 現在の状態

元リポジトリの `voice_effect` ブランチをpullし、`b45fb854946670e8e68067e4fa5f3ef6c1a75904`（3.19.0）にiOS対応を反映しています。iOS版は試験版です。同じiPhoneでAmong Usを前面に開いた状態の送受話は未検証です。

- Capacitor 8.5.0の公式Swift Package ManagerテンプレートからXcodeプロジェクトを追加。
- マイクとローカルネットワークの利用目的を設定。
- Background ModesのaudioとAVAudioSessionの通話カテゴリを設定。
- Android専用の権限要求、背景サービス、オーバーレイ、通知呼び出しをAndroidだけに限定。
- iOSのプラグイン一覧を空に設定。Android用Cordova背景サービスと未実装のiOSオーバーレイプラグインを組み込まない。
- 音声初期化失敗を画面に表示。
- 出力先選択APIのないWebViewでも音声初期化を続けられるよう修正。
- 元リポジトリのアイコンをiOSアプリアイコンに適用。

## Macでのセットアップ

必要なものはNode.js 24.15.0以降、npm 12.2以降、Git、Xcode 26以降です。CocoaPodsは不要です。Xcodeを初回起動し、ライセンスへの同意と必要なコンポーネントのインストールを完了してください。

```sh
npm ci
npm run ios:sync
npm run ios:open
```

`ios`フォルダは追加済みです。`cap add ios`を再実行する必要はありません。`cap sync ios`はSwift Package Managerの定義とWebの生成物を準備します。Xcodeがネイティブ依存関係を取得します。

XcodeでAppターゲットのSigning & Capabilitiesを開き、自分のTeamを選択します。必要に応じてBundle Identifierを自分のものへ変更してください。接続したiPhoneを実行先に選び、開発者モードを有効にしてRunします。TestFlight配布はApple Developer Programのアカウントを使って別途署名・アップロードが必要です。

初回起動で開発者の信頼確認が出る場合は、iPhoneの「設定 → 一般 → VPNとデバイス管理 → デベロッパApp」で自分のApple Accountを許可してください。マイクの利用確認が出たら許可します。

## 同じiPhoneでの必須検証

1. PC版のMobile Hostを有効にし、同一サーバー・名前・ロビーコードで接続。
2. iOS版を前面にした状態で双方向の音声と位置連動を確認。
3. Among Usへ切り替え、2分以上、さらに10分以上の送受話を確認。
4. 会議・死亡・ロビー復帰で音量制御とゲーム状態が更新されることを確認。
5. 画面ロック、Bluetooth切替、着信後の復帰、Wi-Fi切替を確認。
6. 通話切断後にマイク使用が終了することを確認。

前面の通話だけ成功しても、同じiPhoneで使う要件を満たしたとは判断できません。Background Modesの宣言だけでWebViewのマイクやJavaScriptの継続実行は保証されません。無音再生による回避は実装していません。

## バックグラウンドで止まる場合

現在の送受話はWKWebView内のgetUserMedia、WebRTC、Web Audioを使っています。停止する場合はiOSの音声処理をネイティブへ移す必要があります。SwiftのWebRTC実装にシグナリングとピア接続を移し、ゲーム状態の購読も背景で継続させます。Web側との橋渡しでミュート、プレイヤー別音量、近接音声、会議・死亡状態、ボイスエフェクトとNoS連携を維持する必要があります。この移行は今回の試作には含まれていません。

## 参考

- [Capacitor 8の要件](https://capacitorjs.com/docs/updating/8-0)
- [CapacitorのiOS設定](https://capacitorjs.com/docs/ios/configuration)
- [AppleのplayAndRecordとBackground Modes](https://developer.apple.com/documentation/avfaudio/avaudiosession/category-swift.struct/playandrecord)
- [WebKitのWKWebView背景マイク問題](https://bugs.webkit.org/show_bug.cgi?id=233419)

## この環境での検証結果

2026年10月16日に3.19.0を確認しました。

- 上流のvoice_effectブランチのHEADがb45fb854946670e8e68067e4fa5f3ef6c1a75904であることを取得時とビルド後に確認。
- npm 12.2.0でクリーンインストールに成功。lockfileの不足情報を補修し、プロジェクトに直接宣言されたGit依存関係の取得を.npmrcで許可しています。
- Angular本番ビルドとCapacitor iOS同期に成功。
- Jasmine自動テスト205件に成功。
- Xcode 26.5で署名無しのiPhone実機向けビルドに成功。
- バージョン3.19.0、ビルド番号31901をビルド済みアプリで確認。
- SideStore経由の実機インストールと起動は前版3.16.0で確認済み。3.19.0の実機確認は未実施。
- 署名無しのIPAと対応するソースZIPを作成。
- Among Usを前面にした状態での送受話は未検証。
- NoS直接接続の統合テストは別リポジトリのアドオンと.NETが必要なため未実行。

## SideStoreでのインストール

配布IPAは `TanukiBCL-Mobile-iOS-3.19.ipa` です。利用者自身のApple AccountでSideStoreが再署名するため、開発者個人の署名証明書は含めていません。iOS 15以降をビルド対象としていますが、前版3.16.0の実機起動はiPhone 15 Pro Maxで確認済みです。3.19.0の実機起動は未確認です。

1. [SideStore公式インストール手順](https://docs.sidestore.io/docs/installation/install)に従ってSideStoreを準備し、SideStore内でもApple Accountにサインインします。
2. iPhoneをWi-Fiへ接続し、LocalDevVPNを接続します（[公式の前提条件](https://docs.sidestore.io/docs/installation/prerequisites)）。
3. GitHubリリースからIPAをiPhoneの「ファイル」へ保存します。
4. SideStoreの「My Apps」左上の「＋」からIPAを選びます。
5. インストール後、「Tanuki BCL Mobile」を開き、マイクの利用を許可します。
6. 署名期限が切れる前にSideStoreで更新します。無料Apple Accountの通常の署名期間は7日です（[SideStore FAQ](https://docs.sidestore.io/docs/faq)）。

無料署名のアプリ数上限に達している場合は、不要なアプリのデータを確認・保存してから枠を空けてください。SideStoreにも署名枠が必要です。日本語の表示名によるApple App ID登録エラーを避けるため、iOSの表示名は英語にしています。アプリ内UIは日本語です。

このIPAを署名無しのまま直接iPhoneへインストールすることはできません。App Store / TestFlightでの配布は含みません。

## 配布IPAの再ビルド

リリースの `TanukiBCL-Mobile-iOS-3.19-source.zip` がiOSの変更を含む対応ソースです。GitHubが自動生成するv3.19の「Source code」ZIPは、iOSの変更前のタグを指しています。ソースZIPを展開したディレクトリで実行します。

```sh
npm ci
npm run ios:sync
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -configuration Debug -destination 'generic/platform=iOS' \
  -derivedDataPath work/ios-sidestore-build CODE_SIGNING_ALLOWED=NO build
mkdir -p work/ios-ipa/Payload
cp -R work/ios-sidestore-build/Build/Products/Debug-iphoneos/App.app work/ios-ipa/Payload/
(cd work/ios-ipa && zip -r -q ../../TanukiBCL-Mobile-iOS-3.19.ipa Payload)
```

配布したIPAはDebug構成です。プロビジョニングプロファイルや署名を含めず、SideStoreで再署名します。既存の証明書を新規作成・取り消す必要はありません。ビルド出力は新しいディレクトリを使ってください。

## AltStore Classic

AltStore Classicでも同じ署名無しIPAを再署名してインストールできます。[AltStore Classicの導入・公開手順](altstore-classic.md)を参照してください。3.19.0の実機インストール・更新は未確認です。

## 自動リリース

iOSプロジェクトはvoice_effectで管理しています。今後の安定版タグにはiOSソースも含まれます。リリース公開時の自動ビルドと配布ソース更新は[自動リリース手順](ios-releases.md)を参照してください。過去のv3.19タグはiOS追加前のため、同版の開発には添付の対応ソースZIPを使用してください。
