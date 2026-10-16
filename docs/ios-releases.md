# iOS版の自動リリース

GitHubで安定版のmobileリリース（例: v3.20）をPublishすると、Release iOSがMacランナー上で実行されます。タグのソースを使い、バージョン照合、ネイティブ版数設定、テスト、lint、Web本番ビルド、iOSビルドを行います。署名無しIPA・対応ソース・手順・SHA-256を同じリリースへ添付し、AltStore ClassicとSideStoreの固定ソースURLを更新します。

Appleの開発証明書やApple Accountの登録は不要です。利用者はAltStore ClassicまたはSideStoreで自分のApple Accountにより再署名します。端末内での自動インストールは保証しません。

## 通常の公開

1. package.json、environment.prod.ts、Android版数を更新し、iOSソースとRelease iOSワークフローを含むコミットへタグを付けます。
2. GitHub Releasesでその安定版タグをPublishします。GITHUB_TOKENで別のActionsからリリースを作成する場合は、イベントの再発火が抑制されるためRelease iOSをworkflow_dispatchで明示的に起動してください。
3. ActionsのRelease iOSが成功したことを確認します。失敗時は配布ソースを新しいIPAへ切り替えません。Assets公開後に配布情報コミットが失敗した場合は、ログを確認し再実行してください。

未公開のdraftとpre-releaseは配布ソースを更新しません。過去版の再実行でも新しい版をソースの先頭から降ろさないよう、版数順を維持します。

## 手動実行・検証

Actions → Release iOS → Run workflowでrelease_tagを指定します。publishがオフならGitHubリリースや配布ソースを変更せず、ビルド成果物をActions Artifactsへ保存します。

古いv3.19タグにはiOSプロジェクトがないため、初回のビルド検証だけはsource_refにvoice_effectを指定します。source_refを指定した公開実行は禁止しています。通常の新規リリースでは空欄にしてください。

## 制限

GitHubのmacOSランナー、Xcode 26.5、Node .nvmrcの版、npm 12.2を使います。GitHubの実行上限・障害や依存関係の取得失敗時はビルドも失敗します。ソース更新用のpublishジョブだけcontents: writeを使います。ブランチ保護でbotの直接pushが禁止されている場合は公開ログで失敗するため、保護方針に応じた変更が必要です。

ビルドは従来と同じDebug構成です。実機でのインストール・更新、Among Us実行中の背景通話、NoS連携は自動検証していません。TestFlight、App Store、AltStore PALの配布は含みません。
