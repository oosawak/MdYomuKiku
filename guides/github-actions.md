# GitHub Actionsの設定と定期実行の変更

設定ファイルは [`.github/workflows/publish.yml`](../.github/workflows/publish.yml) です。原稿は `novels/` に置き、生成した公開ファイルは `docs/` に保存します。

## 初回の設定

1. `.github/workflows/publish.yml`、原稿、生成コードをGitHubの `main` ブランチに反映します。
2. リポジトリの **Settings → Actions → General** を開きます。
3. **Workflow permissions** で **Read and write permissions** を選択し、**Save** を押します。これは生成した `docs/` を自動コミットするために必要です。
4. **Settings → Pages** を開き、**Build and deployment → Source** を **GitHub Actions** にします。公開用ワークフローは用意済みなので、追加のテンプレート作成は不要です。
5. **Actions → Build novels and publish Pages → Run workflow** を開き、ブランチを **main** にして実行します。
6. `build` と `deploy` が両方成功したら、表示された公開URLを確認します。

追加のシークレット登録は不要です。ブランチ保護がある場合は、自動コミットを許可できる設定が必要です。

## 実行されるタイミング

- 原稿・表紙・生成コードなどの変更を `main` にpushしたとき。
- `schedule` で指定した時刻。
- **Run workflow** から手動実行したとき。

手元のファイルは、コミット・pushして初めてGitHub Actionsから参照できます。`cover.png` の追加・差し替えも更新対象です。定期実行で生成結果に差分がなければ、自動コミットも再公開もしません。

## 1日2回にする

```yaml
  schedule:
    - cron: '17 0,12 * * *'
```

UTCの **0:17・12:17**、日本時間の **9:17・21:17** に実行します。

## 1時間おきにする

```yaml
  schedule:
    - cron: '17 * * * *'
```

毎時17分に実行します。混雑する毎時0分を避けた設定です。

cronの5項目は、左から次の順です。

```text
分 時 日 月 曜日
17 *  *  *  *
```

`*` はすべて、`0,12` は0時と12時を表します。この設定の時刻はUTCです。定期実行はGitHub側の混雑などで遅れる場合があります。

## コメント化して定期実行を止める

YAMLでは `#` から行末までがコメントになります。**`schedule:` と配下の `cron` の両方**をコメント化してください。

```yaml
  # schedule:
  #   - cron: '17 0,12 * * *'
```

`cron` だけをコメント化して空の `schedule:` を残すのは避けてください。

`on:` の中は、例えば次のようになります。`push` と `workflow_dispatch` はそのままなので、push時の自動実行と手動実行を使い続けられます。

```yaml
on:
  push:
    branches: [main]
    paths:
      - 'novels/**'
      - 'src/**'
      - 'assets/**'
      - 'test/**'
      - 'docs/**'
      - 'package.json'
      - 'package-lock.json'
      - '.github/workflows/publish.yml'
  # schedule:
  #   - cron: '17 0,12 * * *'
  workflow_dispatch:
```

再開するときは、2行の先頭の `#` を外し、元のインデントに戻します。

## 変更を反映する

変更するのは `.github/workflows/publish.yml` です。この手順書内の例を書き換えるだけでは、実行設定は変わりません。

設定ファイルを保存し、コミットして `main` にpushしてください。

```bash
git add -- .github/workflows/publish.yml
git commit -m "Change site update schedule"
git push origin main
```

上記は `main` ブランチで作業している場合の例です。別ブランチの場合は、変更を `main` にマージしてください。

定期実行はデフォルトブランチにあるワークフローを使います。このリポジトリのワークフローは `main` で動く設定なので、デフォルトブランチも `main` にします。

## 手動で更新する

定期実行を待たずに更新したい場合：

1. 原稿や画像をコミットして `main` にpushします。
2. **Actions → Build novels and publish Pages** を開きます。
3. **Run workflow** で **main** を選択して実行します。
4. `build` と `deploy` の結果を確認します。

pushで自動実行が始まっている場合は、その実行結果を確認すれば十分です。

## 公式ドキュメント

- [GitHub Pagesの公開元の設定](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [ワークフローの手動実行](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)
- [ワークフローを起動するイベント](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
