# BetterCrewLinkKai Mobile

BetterCrewLinkKai Mobile は、Among Us 向け近接ボイスチャットアプリ [BetterCrewLink Mobile](https://github.com/OhMyGuus/BetterCrewlink-mobile) をベースに、日本語環境で使いやすいよう調整している非公式フォークです。

元プロジェクトは [BetterCrewLink](https://github.com/OhMyGuus/BetterCrewLink) と [CrewLink](https://github.com/ottomated/CrewLink) の流れを引き継いでいます。Among Us、Innersloth、CrewLink、BetterCrewLink の公式プロジェクトとは別の非公式版です。

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

配布版を使う場合は、このフォークの Releases から最新版をダウンロードしてください。

[Releases](https://github.com/kuretoshi/BetterCrewlink-mobile_fix/releases)

Android では APK ファイルを端末にインストールします。環境によっては、ブラウザやファイルマネージャーからのアプリインストールを許可する必要があります。

## Web版

インストールせずにブラウザから利用する場合は、以下の URL にアクセスしてください。

https://bettercrewlink.kuretoshi.work

Web版ではブラウザのマイク権限を許可してください。Android版と同じく、同じロビー内に `Mobile Host` を有効にした PC版 BetterCrewLink ユーザーが必要です。

## 使い方

1. PC版 BetterCrewLinkKai または BetterCrewLink を起動します。
2. PC版側で `Mobile Host` を有効にします。
3. Among Us で同じロビーに入ります。
4. BetterCrewLinkKai Mobile を起動します。
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
