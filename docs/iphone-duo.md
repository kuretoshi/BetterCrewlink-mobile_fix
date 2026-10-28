# iPhone Duoの表示と検証

## 対応

- 安定版のiOS自動ビルドをApple Siliconのxcode-27ランナー、Xcode 27.1 / iOS 27.1 SDKへ更新しています。Intel Macへ新しいXcodeをインストールする必要はありません。
- 本文は左右のsafe areaを避け、ヘッダー・フッターの実寸に合わせてスクロール領域を確保します。
- 接続中のプレイヤー一覧は広い表示領域で列数を増やし、狭い表示では列数を減らします。
- 設定行は画面全体の幅だけでなく、実際に使える本文領域の幅にも追従します。ダイアログも狭い画面に収まる幅にしています。

## 検証方法

ブラウザーでは外側の466×678、内側の626×890と890×626、横向き678×466、狭い分割表示相当の320×678を参考に連続リサイズします。これは公開された物理解像度から3倍表示を仮定した参考サイズで、実機のCSS viewportやsafe areaの測定値ではありません。特定機種の幅を判定する実装は使っていません。

GitHub ActionsのRelease iOSを手動実行し、publishはオフ、duo_previewをオンにすると、GitHubのApple Silicon環境でDuoシミュレーターの起動確認と初期画面のキャプチャも行います。変更を含むタグがまだないときは、そのタグと同じアプリ版数のsource_refを指定してビルドだけ確認できます。成果物はiphone-duo-previewに保存されます。

自動キャプチャは起動時の表示です。折り畳み操作、開閉中のレイアウト、実機上の画面占有領域、通話・Among Usとの同時利用を確認したことにはなりません。

参考: [AppleのDuo対応手順](https://developer.apple.com/iphone-duo/prepare/)、[Appleの仕様](https://www.apple.com/iphone-duo/specs/)、[GitHubのXcode 27ランナー](https://github.com/actions/runner-images/blob/main/images/macos/xcode-27-arm64-Readme.md)。
