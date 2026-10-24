# タヌキのベタクルmobile

タヌキのベタクルmobile は、Among Us 向け近接ボイスチャットアプリ [BetterCrewLink Mobile](https://github.com/OhMyGuus/BetterCrewlink-mobile) をベースに、日本語環境で使いやすいよう調整している非公式フォークです。

元プロジェクトは [BetterCrewLink](https://github.com/OhMyGuus/BetterCrewLink) と [CrewLink](https://github.com/ottomated/CrewLink) の流れを引き継いでいます。Among Us、Innersloth、CrewLink、BetterCrewLink の公式プロジェクトとは別の非公式版です。

## 3.39

タヌキ丼0.1.0-β16のヒーロー変身中は、衣装変更を理由とするボイスエフェクトを適用しません。「NGワード」と「変身」の音声認識をホストへ任せられるよう、Web・モバイルの参加方法を通知します。PC版3.2.47／.NET版3.2.47-net-beta.1と合わせて使用してください。Web・モバイル端末自体には音声認識モデルを追加していません。

## 3.38

PC版3.2.46、.NET版3.2.46-net-beta.1との通信互換バージョンを通知します。音声処理と設定内容は3.37と同じです。

## 3.35

ボイスエフェクトごとの強さを個人設定として保存し、ゲーム中も調整できます。対応エフェクトを選んでマイクから試せる「エフェクトテスト」を独立した区画に設けました。有効／無効は引き続きロビー設定で管理します。PC版3.2.43と.NET版3.2.43-net-beta.1との通信互換バージョンを通知します。

## 3.34

NoSとSNRのボイスエフェクト項目は、それぞれのMOD検出時に表示します。NoSのタヌキ丼アドオンを検出した場合だけ、ボイスジャミンガー・メガホン・ビビリの強さを表示します。有効／無効はロビー設定、強さはボイスエフェクトに表示し、PCホストがゲーム中に更新した値も受信します。モバイルではホスト設定は閲覧専用です。PC版3.2.42と.NET版3.2.42-net-beta.1との通信互換バージョンを通知します。

## 3.33

ボイスエフェクトをオーディオから独立した設定項目に移し、キノコカオス・変装、SNRジャンボ、NoSの役職・状態ごとの強さを確認できます。ホストのロビー設定は閲覧専用です。PC版3.2.41と.NET版3.2.41-net-beta.1との通信互換バージョンを通知します。

## 3.32

NoS UchuAddonのシトラス感染時ボイスチェンジャーの強さを、PC/.NETホストのロビー設定に合わせて0～100%で反映します。モバイル版のロビー設定画面にもホストの値を表示します。0%は効果なし、100%は従来の強さです。PC版3.2.40と.NET版3.2.40-net-beta.1との音声通信互換バージョンを通知します。

## 3.31

PC版3.2.39および.NET版3.2.39-net-beta.1との音声通信互換バージョンを通知します。モバイル版3.30がPC版3.2.24相当と通知していたため、対応ホストとの間でも古い版として表示される問題を修正しました。PC版の全機能をモバイルへ移植したことを意味するものではありません。

## 3.29

PC版3.2.37のNoS第三陣営の通話距離修正を取り込みました。「視界内のプレイヤーの声だけが聞こえる」が有効でも、NoS第三陣営の通常会話はロビー設定の音声距離を使います。クルーの視界連動、インポスターの音声距離、他MOD、ラジオ等の専用音声は維持します。Web・Android・iOSは共通の音声判定を使用します。PC版3.2.37の全機能を移植した版ではありません。

## 3.28

PC版3.2.24相当（旧モバイル版3.16）をベースに、タヌキ丼の「ダイイングボイスメッセージ」へ対応した版です。PC版3.2.36の全機能を移植した版ではありません。

死亡後の声を設定秒数だけ録音し、生存者が死亡地点へ近づくとラジオ風に再生します。ループ再生設定に対応しています。録音は端末メモリ内にのみ保持し、試合終了時に破棄します。インタビュアーの録音・会議中再生にも対応しています。タヌキ丼0.1.0-β11と、ホスト側の対応PC版3.2.36または.NET版3.2.36-net-beta.1以降をご利用ください。

iOSの署名無しIPAはAltStore Classic / SideStoreで再署名して利用できます。

## このフォークについて

- 日本語 UI / 日本語説明を中心に調整しています。
- BetterCrewLink Mobile の機能をベースにしつつ、国内プレイヤー向けの使いやすさを優先しています。
- キノコカオスやカモフラージュ系の状態に合わせたボイスエフェクト調整を追加しています。
- ボイスエフェクトの強度調整とマイクテスト機能を追加しています。
- Android / Web での利用を主な対象にしています。

## 主な機能

- Among Us の位置情報に連動した近接ボイスチャット
- PC版 BetterCrewLink の `Mobile Host` と連携したモバイル接続
- 死亡者、インポスター、会議中などの状態に応じた音声制御
- マイク選択
- Android オーバーレイ表示
- プレイヤーごとの音量調整
- ロビー設定の同期
- キノコカオス / カモフラージュ時のボイスエフェクト
- ボイスエフェクト強度の調整とマイクテスト

## ダウンロード

### NoSアドオン直接接続（ベータ機能）

役職用の声量は本人のWeb/APKから本人のNoSアドオンへWSSで直接送ります。本人のPC版ベタクルは不要です。通常の通話とMobile Hostによるゲーム情報配信、メガホン・レーザーの音声範囲と加工・死亡時の残響は既存の仕組みを使います。

Web・モバイルの役職マイク連携はホスト中継方式（ベータ）です。対応版のホストのベタクルとアドオンBuild37以降を使用し、参加者は通常の参加操作だけで自動接続します。証明書登録や接続コードは不要です。実ゲームでの混在接続は未検証です。

[接続手順と制約](docs/nos-direct-voice.md)

配布版を使う場合は、このフォークの Releases から最新版をダウンロードしてください。

[Releases](https://github.com/kuretoshi/BetterCrewlink-mobile_fix/releases)

Android では APK ファイルを端末にインストールします。環境によっては、ブラウザやファイルマネージャーからのアプリインストールを許可する必要があります。

### Discordへのリリース通知（管理者向け）

Discordの通知先チャンネルでWebhookを作成し、このリポジトリの **Settings → Secrets and variables → Actions → New repository secret** に `DISCORD_RELEASE_WEBHOOK_URL` という名前でURLを登録してください。Webhook URLはリポジトリのファイルに書き込まないでください。

設定後にGitHub Releaseを公開すると、GitHub Actionsの `Notify Discord on release` がリリース名・バージョン・リンクを通知します。通常リリースとプレリリースの両方が対象で、既に公開済みのリリースには遡って通知しません。Secretが未設定の場合はワークフローが失敗し、通知されません。

## Web版

インストールせずにブラウザから利用する場合は、以下の URL にアクセスしてください。

https://bettercrewlink.kuretoshi.work

Web版ではブラウザのマイク権限を許可してください。Android版と同じく、同じロビー内に `Mobile Host` を有効にした PC版 BetterCrewLink ユーザーが必要です。

## 使い方

1. PC版 TanukiBCL または BetterCrewLink を起動します。
2. PC版側で `Mobile Host` を有効にします。
3. Among Us で同じロビーに入ります。
4. タヌキのベタクルmobile を起動します。
5. ボイスサーバー、ゲーム内の名前、ロビーコード、マイクを設定します。
6. `接続` を押します。

全員が同じボイスサーバーを使っている必要があります。接続できない場合は、ロビーコード、ゲーム内の名前、サーバー URL、PC版側の `Mobile Host` 設定を確認してください。

## ボイスエフェクト

このフォークでは、キノコカオスやカモフラージュ系の状態に合わせて声にエフェクトをかけられます。

設定画面の `ボイスエフェクト` で効果量を調整できます。`テスト時のエフェクト` を ON にして `マイクテスト` を開始すると、実際にどのように聞こえるか確認できます。

この機能は環境差やゲーム状態の取得タイミングに影響される可能性があります。動作確認や不具合報告を歓迎します。

## 不具合報告

こちらの Discord サーバーに報告をお願いします。

https://discord.gg/cUX5KUkZPD

GitHub Issues を使う場合はこちらです。

https://github.com/kuretoshi/BetterCrewlink-mobile_fix/issues

## 開発

### 必要なもの

- Node.js
- npm
- Git
- Android Studio
- Ionic CLI

```powershell
npm.cmd install -g @ionic/cli
```

PowerShell で `npm` が実行ポリシーにより止まる場合は、`npm.cmd` を使ってください。

### セットアップ

```powershell
git clone https://github.com/kuretoshi/BetterCrewlink-mobile_fix.git
cd BetterCrewlink-mobile_fix
npm.cmd install
npx.cmd cap sync
```

### 開発起動

```powershell
npm.cmd start
```

または Ionic CLI が入っている場合:

```powershell
npm.cmd run dev
```

### コンパイル

```powershell
npm.cmd run ngbuild
```

### Android ビルド

```powershell
npm.cmd run build
```

環境によっては Android Studio で `android` プロジェクトを開いてビルドしてください。

## 貢献

不具合修正、翻訳改善、日本語表現の調整、機能改善の Pull Request を歓迎します。

大きな変更を入れる場合は、先に Issue などで方針を相談してもらえると助かります。

## 元プロジェクト

このリポジトリは以下のプロジェクトをベースにしています。

- [OhMyGuus/BetterCrewlink-mobile](https://github.com/OhMyGuus/BetterCrewlink-mobile)
- [OhMyGuus/BetterCrewLink](https://github.com/OhMyGuus/BetterCrewLink)
- [ottomated/CrewLink](https://github.com/ottomated/CrewLink)

元プロジェクトの開発者、コントリビューター、翻訳者の皆さまに感謝します。

## ライセンス

このプロジェクトは GNU General Public License v3.0 のもとで配布されています。詳細は [LICENSE](LICENSE) を確認してください。

## 免責

この mod は Among Us または Innersloth LLC とは関係ありません。内容は Innersloth LLC によって承認、支援、提供されたものではありません。Among Us に関する権利は Innersloth LLC に帰属します。
