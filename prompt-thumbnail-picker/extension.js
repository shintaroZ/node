const vscode = require("vscode");
const fs = require("fs");
const path = require("path");

let lastActiveEditor;

function activate(context) {

    // 起動時点のエディタを記憶
    lastActiveEditor = vscode.window.activeTextEditor;

    // エディタが切り替わったら記憶
    const editorChangeDisposable =
        vscode.window.onDidChangeActiveTextEditor(editor => {

            // Webviewへフォーカスした場合は undefined になるので
            // そのときは前のエディタを保持する
            if (editor) {
                lastActiveEditor = editor;
            }
        });

    const disposable = vscode.commands.registerCommand(
        "promptThumbnailPicker.open",
        () => openPromptPicker(context)
    );

    context.subscriptions.push(
        disposable,
        editorChangeDisposable
    );
}
function openPromptPicker(context) {
    const workspaceFolder =
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) {
        vscode.window.showErrorMessage(
            "VS Codeでフォルダを開いてください。"
        );
        return;
    }
    /** prompts.tsvの場所 */
    const config = vscode.workspace.getConfiguration(
        "promptThumbnailPicker"
    );

    const relativePath = config.get(
        "tsvPath",
        "prompts.tsv"
    );

    const tsvPath = path.join(
        workspaceFolder,
        relativePath
    );

    if (!fs.existsSync(tsvPath)) {
        vscode.window.showErrorMessage(
            `prompts.tsv が見つかりません: ${tsvPath}`
        );
        return;
    }
    const prompts = loadTsv(tsvPath);
    const panel = vscode.window.createWebviewPanel(
        "promptThumbnailPicker",
        "Prompt Picker",
        vscode.ViewColumn.Beside,
        {
            enableScripts: true,
            retainContextWhenHidden: true
        }
    );
    panel.webview.html = getHtml(prompts);
    panel.webview.onDidReceiveMessage(
        async message => {
            switch (message.command) {
                case "insert":
                    await insertText(message.value);
                    break;
                case "copy":
                    await vscode.env.clipboard.writeText(
                        message.value
                    );
                    vscode.window.setStatusBarMessage(
                        "Promptをコピーしました",
                        2000
                    );
                    break;
            }
        },
        undefined,
        context.subscriptions
    );
}
function loadTsv(tsvPath) {
    const text = fs
        .readFileSync(tsvPath, "utf8")
        .replace(/^\uFEFF/, "");
    const lines = text
        .split(/\r?\n/)
        .filter(line => line.trim() !== "");
    if (lines.length <= 1) {
        return [];
    }
    return lines
        .slice(1)
        .map(line => {
            const cols = line.split("\t");
            return {
                category: cols[0] ?? "",
                key: cols[1] ?? "",
                value: cols[2] ?? "",
                image: cols[3] ?? ""
            };
        });
}
async function insertText(text) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage(
            "挿入先のエディタがありません。"
        );
        return;
    }
    await editor.edit(editBuilder => {
        for (const selection of editor.selections) {
            editBuilder.replace(
                selection,
                text
            );
        }
    });
}
function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
function getHtml(prompts) {
    const dataJson = JSON.stringify(prompts)
        .replace(/</g, "\\u003c");
    return `
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta
    http-equiv="Content-Security-Policy"
    content="
        default-src 'none';
        img-src https: data:;
        style-src 'unsafe-inline';
        script-src 'unsafe-inline';
    "
>
<style>
body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background:
        var(--vscode-editor-background);
    padding: 16px;
}
.toolbar {
    position: sticky;
    top: 0;
    background:
        var(--vscode-editor-background);
    padding-bottom: 12px;
    z-index: 10;
}
input {
    box-sizing: border-box;
    width: 100%;
    padding: 10px;
    font-size: 14px;
    color:
        var(--vscode-input-foreground);
    background:
        var(--vscode-input-background);
    border:
        1px solid
        var(--vscode-input-border);
}
.card {
    display: grid;
    grid-template-columns: 160px 1fr;
    gap: 14px;
    padding: 12px 0;
    border-bottom:
        1px solid
        var(--vscode-panel-border);
}
.thumbnail {
    width: 150px;
    height: 110px;
    object-fit: contain;
    background:
        var(--vscode-editorWidget-background);
}
.category {
    font-size: 12px;
    opacity: 0.7;
}
.key {
    font-size: 16px;
    font-weight: bold;
    margin: 4px 0 8px;
}
.value {
    white-space: pre-wrap;
    word-break: break-word;
    margin-bottom: 10px;
}
button {
    margin-right: 8px;
    padding: 5px 12px;
    color:
        var(--vscode-button-foreground);
    background:
        var(--vscode-button-background);
    border: none;
    cursor: pointer;
}
button:hover {
    background:
        var(--vscode-button-hoverBackground);
}
</style>
</head>
<body>
<div class="toolbar">
    <input
        id="search"
        type="text"
        placeholder="Key / Category / Prompt を検索..."
        autofocus
    >
</div>
<div id="list"></div>
<script>
const vscode = acquireVsCodeApi();
const prompts = ${dataJson};
const list =
    document.getElementById("list");
const search =
    document.getElementById("search");
function render(filter = "") {
    const keyword =
        filter.toLowerCase();
    list.innerHTML = "";
    const filtered =
        prompts.filter(item => {
            return (
                item.category +
                " " +
                item.key +
                " " +
                item.value
            )
            .toLowerCase()
            .includes(keyword);
        });
    for (const item of filtered) {
        const card =
            document.createElement("div");
        card.className = "card";
        const image =
            document.createElement("img");
        image.className =
            "thumbnail";
        image.src =
            item.image;
        const content =
            document.createElement("div");
        const category =
            document.createElement("div");
        category.className =
            "category";
        category.textContent =
            item.category;
        const key =
            document.createElement("div");
        key.className =
            "key";
        key.textContent =
            item.key;
        const value =
            document.createElement("div");
        value.className =
            "value";
        value.textContent =
            item.value;
        const copy =
            document.createElement("button");
        copy.textContent =
            "COPY";
        copy.onclick = () => {
            vscode.postMessage({
                command: "copy",
                value: item.value
            });
        };
        const insert =
            document.createElement("button");
        insert.textContent =
            "INSERT";
        insert.onclick = () => {
            vscode.postMessage({
                command: "insert",
                value: item.value
            });
        };
        content.appendChild(
            category
        );
        content.appendChild(
            key
        );
        content.appendChild(
            value
        );
        content.appendChild(
            copy
        );
        content.appendChild(
            insert
        );
        card.appendChild(
            image
        );
        card.appendChild(
            content
        );
        list.appendChild(
            card
        );
    }
}
search.addEventListener(
    "input",
    event => {
        render(
            event.target.value
        );
    }
);
render();
</script>
</body>
</html>
`;
}
function deactivate() {}
module.exports = {
    activate,
    deactivate
};