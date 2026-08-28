# Prompt Thumbnail Picker

VS Code 上で TSV に定義した Prompt をサムネイル付きで一覧表示し、選択した Prompt をエディタへ挿入するための拡張機能です。

## Setup

### 1. Node.js Install

Node.js をインストールします。

https://nodejs.org/en/download

インストール後、以下のコマンドで確認します。

```bash
node -v
npm -v
```

#### macOS

macOS のバージョンによっては、最新の Node.js が動作しない場合があります。

その場合は `nvm` を利用して、対応する Node.js のバージョンをインストールします。

例:

```bash
nvm install 20
nvm use 20
nvm alias default 20
```

確認:

```bash
node -v
npm -v
```

---

### 2. Project Structure

例:

```text
prompt-thumbnail-picker/
├── package.json
├── extension.js
└── .vscode/
    └── launch.json
```

Prompt データは、拡張機能側ではなく利用する Python プロジェクト側に配置します。

例:

```text
python-tool/
├── prompts.tsv
├── sea/
├── config/
└── .vscode/
```

---

### 3. prompts.tsv

Prompt 一覧を TSV 形式で作成します。

例:

```tsv
category	key	value	description	image
sdxl    key val note    https://hoge.png
```

各列:

| Column        | Description                    |
| ------------- | ------------------------------ |
| `category`    | 用途・分類。例: Anima用 / SDXL用 / WAN用 |
| `key`         | Picker 上に表示する名称                |
| `value`       | COPY / INSERT する Prompt        |
| `description` | Prompt の説明                     |
| `image`       | サムネイル画像の HTTPS URL             |

---

## Debug

### launch.json

`.vscode/launch.json` を作成します。

```json
{
    "version": "0.2.0",
    "configurations": [
        {
            "name": "Run Prompt Picker",
            "type": "extensionHost",
            "request": "launch",
            "args": [
                "--extensionDevelopmentPath=${workspaceFolder}"
            ]
        }
    ]
}
```

---

### Start Extension

拡張機能プロジェクトを VS Code で開きます。

```text
prompt-thumbnail-picker
```

VS Code 上で `F5` を押します。

すると、別ウインドウで以下が起動します。

```text
Extension Development Host
```

---

### Open Python Project

`Extension Development Host` 側で、実際に利用する Python プロジェクトを開きます。

```text
File
  → Open Folder...
  → python-tool
```

`prompts.tsv` は、この Python プロジェクト側に配置します。

例:

```text
python-tool/
├── prompts.tsv
├── sea/
└── ...
```

---

## Usage

Python ファイル等、Prompt を挿入したいエディタを開きます。

その状態で以下を実行します。

```text
Ctrl + Alt + P
```

Prompt Picker が右側に表示されます。

Picker では以下の操作が可能です。

* Category 別表示
* Key / Category / Prompt の検索
* HTTPS URL のサムネイル表示
* `COPY` による Prompt のクリップボードコピー
* `INSERT` による現在のエディタへの Prompt 挿入

---

## Development Flow

```text
VS Code
│
├─ prompt-thumbnail-picker
│      │
│      └─ F5
│
└─ Extension Development Host
       │
       ├─ python-tool を開く
       │
       ├─ prompts.tsv を読み込む
       │
       └─ Ctrl + Alt + P
              │
              └─ Prompt Picker
```

拡張機能側のコードを修正した場合は、一度デバッグを終了してから再度 `F5` で起動します。

```text
Shift + F5
↓
F5
```
