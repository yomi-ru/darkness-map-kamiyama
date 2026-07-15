# Route Darkness Checker Frontend

Google Maps と Google Sheets を連携し、ルート上の危険情報をもとに安全寄りのルートを提案するフロントエンドアプリです。

このアプリでは、Google Sheets に登録された「暗さ情報」を地図上に表示し、ユーザーが指定した出発地点・到着地点間のルートに含まれる危険情報をもとに、最大暗さレベル・平均暗さレベル・危険情報件数・距離を評価します。

---

## 機能概要

* Google Maps 上で出発地点を指定
* Google Maps 上で到着地点を指定
* Google Sheets の危険情報を地図上にプロット
* ルート周辺の危険情報を判定
* 複数候補ルートから安全寄りのルートを選択
* サイト上のフォームから危険情報を追加
* Apps Script 経由で Google Sheets にデータを書き込み
* 日の入りから翌日の日の出までの間だけ危険情報を表示
* デバッグ時は昼夜に関係なく危険情報を表示可能

---

## 使用技術

* HTML
* CSS
* JavaScript
* Google Maps JavaScript API
* Google Sheets API
* Google Apps Script
* Sunrise Sunset API

---

## ディレクトリ構成

```txt
.
├── index.html
├── style.css
├── script.js
└── README.md
```

---

## Google Sheets のテーブル設計

このアプリでは、Google Sheets の以下の列を使用します。

| 列  | 内容    |
| -- | ----- |
| A列 | ID    |
| B列 | 当該箇所名 |
| C列 | 緯度    |
| D列 | 経度    |
| E列 | 暗さレベル |
| F列 | 備考    |

1行目は見出しとして使用し、2行目以降に危険情報を登録します。

例：

| ID | 当該箇所名 | 緯度        | 経度         | レベル | 備考        |
| -- | ----- | --------- | ---------- | --- | --------- |
| 1  | 校門前の道 | 33.969103 | 134.354524 | 2   | 街灯が少ない    |
| 2  | 体育館横  | 33.970826 | 134.361975 | 3   | 夜間は見通しが悪い |

---

## 事前準備

### 1. Google Cloud で API を有効化する

Google Cloud Console で以下の API を有効化します。

* Maps JavaScript API
* Google Sheets API

### 2. APIキーを作成する

Google Cloud Console の「APIとサービス」→「認証情報」から API キーを作成します。

作成した API キーには、必要に応じて以下の制限を設定してください。

#### アプリケーション制限

ローカル開発の場合：

```txt
http://127.0.0.1:*
http://localhost:*
```

本番公開する場合：

```txt
https://your-domain.example/*
```

#### API制限

以下の API を許可します。

```txt
Maps JavaScript API
Google Sheets API
```

---

## Google Sheets の共有設定

Google Sheets API で読み取るため、スプレッドシートを以下のように設定します。

```txt
リンクを知っている全員：閲覧者
```

非公開のまま読み取る場合は、OAuth やサーバーサイド処理が別途必要です。

---

## Apps Script の準備

サイト上のフォームから Google Sheets に書き込むため、Apps Script を Web アプリとして使用します。

Google Sheets で以下を開きます。

```txt
拡張機能
↓
Apps Script
```

Apps Script 側では、フォームから送信されたデータを受け取り、スプレッドシートの A〜F 列に追記します。

A列には通し番号の ID を自動入力し、B〜F列には以下のデータを登録します。

```txt
B列: 当該箇所名
C列: 緯度
D列: 経度
E列: レベル
F列: 備考
```

Apps Script を変更した場合は、必ず再デプロイしてください。

```txt
デプロイ
↓
デプロイを管理
↓
編集
↓
バージョン: 新しいバージョン
↓
デプロイ
```

---

## 設定方法

`index.html` 内の `APP_CONFIG` を編集します。

```js
const APP_CONFIG = {
    apiKey: "YOUR_API_KEY",
    spreadsheetId: "YOUR_SPREADSHEET_ID",
    sheetName: "シート1",
    readRange: "B2:F",
    submitUrl: "YOUR_APPS_SCRIPT_WEB_APP_URL",
    pollingMs: 5000,
    alwaysShowDangerPointsForTest: true
};
```

### 各項目の説明

| 項目                            | 説明                                        |
| ----------------------------- | ----------------------------------------- |
| apiKey                        | Google Maps API / Sheets API で使用する API キー |
| spreadsheetId                 | Google Sheets のスプレッドシートID                 |
| sheetName                     | 読み込むシート名                                  |
| readRange                     | 読み込む範囲                                    |
| submitUrl                     | Apps Script の Web アプリURL                  |
| pollingMs                     | Sheets を再取得する間隔                           |
| alwaysShowDangerPointsForTest | デバッグ用の常時表示設定                              |

---

## spreadsheetId の取得方法

Google Sheets のURLが以下のような形式の場合、

```txt
https://docs.google.com/spreadsheets/d/xxxxxxxxxxxxxxxxxxxxxxxxxxxx/edit?gid=0
```

`/d/` の後から `/edit` の前までが `spreadsheetId` です。

```txt
xxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## ローカルでの起動方法

VS Code の Live Server などを使用して起動します。

```txt
index.html を右クリック
↓
Open with Live Server
```

ブラウザで以下のようなURLで開きます。

```txt
http://127.0.0.1:5500/
```

Google Maps API の HTTP リファラー制限に、ローカルURLを許可しておく必要があります。

---

## 基本的な使い方

### ルート判定

1. 「出発地点を地図で選ぶ」を押す
2. 地図上で出発地点をクリック
3. 「到着地点を地図で選ぶ」を押す
4. 地図上で到着地点をクリック
5. 「ルートを判定する」を押す
6. 複数候補ルートの中から安全寄りのルートが表示される

ルートの評価は以下の順で行います。

1. 最大暗さレベルが低い
2. 平均暗さレベルが低い
3. 危険情報件数が少ない
4. 距離が短い

---

### 危険情報の追加

1. 「暗さ情報を入力する」を押す
2. 地図上で危険情報を登録したい場所をクリック
3. 当該箇所名を入力
4. 暗さレベルを選択
5. 必要に応じて備考を入力
6. 「登録する」を押す
7. Apps Script 経由で Google Sheets に追記される
8. 数秒後に地図上へ反映される

---

## 暗さレベル

| レベル | 意味    |
| --- | ----- |
| 1   | やや暗い  |
| 2   | 暗い    |
| 3   | かなり暗い |

---

## 表示時間の制御

このアプリでは、日の入りから翌日の日の出までの間だけ危険情報を表示できます。

日の出・日の入りの判定には Sunrise Sunset API を使用しています。

デバッグ中は、以下の設定を `true` にすることで、昼夜に関係なく危険情報を表示できます。

```js
alwaysShowDangerPointsForTest: true
```

本番環境では、以下のように `false` にしてください。

```js
alwaysShowDangerPointsForTest: false
```

---

## よくあるエラーと確認ポイント

### 地図が表示されない

以下を確認してください。

* Maps JavaScript API が有効化されているか
* APIキーが正しいか
* HTTPリファラー制限に現在のURLが含まれているか
* ブラウザの Console に `InvalidKeyMapError` や `RefererNotAllowedMapError` が出ていないか

---

### Sheets の危険情報が読み込まれない

以下を確認してください。

* Google Sheets API が有効化されているか
* APIキーの制限に Google Sheets API が含まれているか
* `spreadsheetId` が正しいか
* `sheetName` が実際のシート名と一致しているか
* スプレッドシートが「リンクを知っている全員：閲覧者」になっているか
* `readRange` が正しいか

---

### フォームから書き込めない

以下を確認してください。

* `submitUrl` に Apps Script の Web アプリURLが入っているか
* Apps Script のデプロイ設定が「アクセスできるユーザー: 全員」になっているか
* Apps Script を更新後に新しいバージョンとして再デプロイしているか
* GAS 側の `SHEET_NAME` が実際のシート名と一致しているか
* スプレッドシートに直接行が追加されているか

---

### Apps Script のURLを開くと doGet エラーが出る

Apps Script に `doGet()` がない場合、WebアプリURLをブラウザで直接開くとエラーになります。

これはブラウザで開いたときのリクエストが GET であるためです。

フォームからの登録では POST が使われるため、`doPost(e)` が正しく設定されていれば書き込み自体は可能です。

疎通確認用に `doGet()` を追加しておくと便利です。

---

## セキュリティ上の注意

APIキーや Apps Script のURLは、公開リポジトリにそのまま置くと第三者に利用される可能性があります。

最低限、Google Cloud Console で以下の制限をかけてください。

* HTTPリファラー制限
* API制限

また、Apps Script の Web アプリURLを知っている人はPOSTできる可能性があるため、本番運用では認証やトークンチェックの導入も検討してください。

---

## 開発メモ

現在の構成では、Sheets の読み取りは Google Sheets API、書き込みは Apps Script Webアプリで行っています。

```txt
Google Sheets → サイト
    Sheets API で読み取り

サイト → Google Sheets
    Apps Script doPost で書き込み
```

この構成により、フロントエンドだけで比較的簡単に読み書きの同期を実現できます。

---

## 今後の改善案

* Google Maps の新しい Routes API への移行
* `google.maps.Marker` から `AdvancedMarkerElement` への移行
* Firebase Realtime Database を使った完全リアルタイム同期
* 危険情報の編集・削除機能
* ログイン機能の追加
* 投稿者情報の記録
* 投稿内容の承認フロー
* スマートフォン向けUIの最適化
* 現在地からのルート判定
* レベル3を避ける迂回ルート提案
