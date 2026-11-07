# Study Quest with Santa Claus（配付用）

中学校社会科の一問一答を、8ステージ×10問で進める Google Apps Script Webアプリです。ステージをクリアするたびにサンタの準備が進みます。

このリポジトリは、アプリを自分のGoogleアカウントで動かすための配付用コードです。学校で運用中のスプレッドシート、GASプロジェクト、生徒情報、学習記録は含まれていません。受け取る人は、新しいスプレッドシートとGASプロジェクトを作って使います。

仕様は [要件定義書](youkenn.md) にまとめています。

## 入っているもの

- `gas/`：GAS本体。自分のプロジェクトへ送る対象です。
- `preview/`：テスト用データで操作するローカル試運転版。
- `scripts/verify.mjs`：構文と呼び出し先の確認。
- `scripts/build-preview.mjs`：GASのHTMLから試運転画面を生成。
- `scripts/embed-santa-images.mjs`：サンタ画像をGAS用HTMLへ埋め込む処理。
- `.clasp.example.json`：自分のスクリプトIDとスプレッドシートIDを書くときの見本。

## 試運転

```sh
node scripts/build-preview.mjs
python3 -m http.server 4173 --directory preview
```

ブラウザーで `http://127.0.0.1:4173/` を開きます。生徒IDは `demo`、パスワードは `santa123` です。試運転問題は記述・〇×・4択が混在し、記述の答えは `正解`、〇×は `×`、4択は「正解」を選びます。教師画面の試運転パスワードは `change-me` です。試運転の進捗はブラウザー内だけに保存されます。

## 自分の環境で使う

1. Googleスプレッドシートを新規作成します。
2. そのスプレッドシートで「拡張機能」→「Apps Script」を開き、GASプロジェクトを作ります。
3. `.clasp.example.json` を `.clasp.json` という名前でコピーし、`scriptId` と `parentId` を自分のIDに書き換えます。`.clasp.json` はリポジトリに含めないでください。
4. [clasp](https://github.com/google/clasp) で `clasp push` を実行するか、`gas/` のファイルをApps Scriptエディタへコピーします。
5. スプレッドシートに戻り、メニュー「Study Quest with Santa Claus」から「新版の初期シートを作成」を実行します。関数名は `setupStudyQuest` です。
6. 教師用初期パスワード `change-me` を、管理画面からすぐに変更します。
7. 生徒と問題を登録します。各ステージの公開問題が10問ずつ揃うまで、生徒は学習を開始できません。
8. Webアプリとしてデプロイします。`gas/appsscript.json` の公開範囲は、同じGoogle Workspaceドメインのユーザー向けです。

問題形式は「記述」「〇×」「4択」です。教師管理画面の問題追加で形式を選べます。サンタ画像は開始時からステージ8クリアまで、9枚を順番に切り替えます。

## ライセンス

このリポジトリは [MIT License](LICENSE) です。著作権表示は `Copyright (c) 2026 office-NAKAON` です。
