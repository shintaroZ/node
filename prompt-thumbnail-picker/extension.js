const vscode = require("vscode");
const fs = require("fs");
const path = require("path");

let lastActiveEditor;

/**
 * Extension activate
 */
function activate(context) {

    // 起動時点のエディタを保持
    lastActiveEditor = vscode.window.activeTextEditor;

    // 最後に操作したTextEditorを保持
    const editorChangeDisposable =
        vscode.window.onDidChangeActiveTextEditor(editor => {

            // Webviewへフォーカスするとundefinedになるため、
            // editorがある場合だけ更新する
            if (editor) {
                lastActiveEditor = editor;
            }
        });

    const commandDisposable =
        vscode.commands.registerCommand(
            "promptThumbnailPicker.open",
            () => openPromptPicker(context)
        );

    context.subscriptions.push(
        commandDisposable,
        editorChangeDisposable
    );
}


/**
 * Prompt Pickerを開く
 */
function openPromptPicker(context) {

    const workspaceFolder =
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    if (!workspaceFolder) {
        vscode.window.showErrorMessage(
            "VS Codeでフォルダを開いてください。"
        );
        return;
    }


    // --------------------------------
    // prompts.tsv のパス取得
    // --------------------------------

    const config =
        vscode.workspace.getConfiguration(
            "promptThumbnailPicker"
        );

    const relativePath =
        config.get(
            "tsvPath",
            "prompts.tsv"
        );

    const tsvPath =
        path.join(
            workspaceFolder,
            relativePath
        );


    if (!fs.existsSync(tsvPath)) {

        vscode.window.showErrorMessage(
            `prompts.tsv が見つかりません: ${tsvPath}`
        );

        return;
    }


    // --------------------------------
    // TSV読込
    // --------------------------------

    let prompts;

    try {

        prompts = loadTsv(tsvPath);

    }
    catch (error) {

        vscode.window.showErrorMessage(
            `prompts.tsv の読み込みに失敗しました: ${error.message}`
        );

        console.error(
            "[Prompt Picker] TSV ERROR:",
            error
        );

        return;
    }


    console.log(
        `[Prompt Picker] TSV: ${tsvPath}`
    );

    console.log(
        `[Prompt Picker] Prompt count: ${prompts.length}`
    );

    // 画像URL確認用
    console.log(
        "[Prompt Picker] Images:",
        prompts.map(item => ({
            key: item.key,
            image: item.image
        }))
    );


    // --------------------------------
    // Webview
    // --------------------------------

    const panel =
        vscode.window.createWebviewPanel(
            "promptThumbnailPicker",
            "Prompt Picker",

            {
                viewColumn:
                    vscode.ViewColumn.Beside,

                // Pickerを開いた瞬間に
                // TextEditorからフォーカスを奪わない
                preserveFocus: true
            },

            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );


    panel.webview.html =
        getHtml(
            panel.webview,
            prompts
        );


    // --------------------------------
    // Webview → Extension
    // --------------------------------

    panel.webview.onDidReceiveMessage(
        async message => {

            switch (message.command) {

                case "insert":

                    await insertText(
                        message.value
                    );

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


/**
 * TSV読込
 *
 * ヘッダー名で取得するため列順自由
 *
 * 必須:
 *   key
 *   value
 *
 * 任意:
 *   category
 *   description
 *   image
 */
function loadTsv(tsvPath) {

    const text =
        fs.readFileSync(
            tsvPath,
            "utf8"
        )
        .replace(/^\uFEFF/, "");


    const lines =
        text
            .split(/\r?\n/)
            .filter(
                line =>
                    line.trim() !== ""
            );


    if (lines.length <= 1) {
        return [];
    }


    // --------------------------------
    // Header
    // --------------------------------

    const headers =
        lines[0]
            .split("\t")
            .map(
                header =>
                    header.trim()
            );


    // 必須ヘッダー確認
    const requiredHeaders = [
        "key",
        "value"
    ];


    for (const required of requiredHeaders) {

        if (!headers.includes(required)) {

            throw new Error(
                `必須列 "${required}" がありません`
            );
        }
    }


    // --------------------------------
    // Rows
    // --------------------------------

    return lines
        .slice(1)
        .map(line => {

            const cols =
                line.split("\t");


            const row = {};


            headers.forEach(
                (header, index) => {

                    row[header] =
                        cols[index] ?? "";
                }
            );


            return {

                category:
                    (row.category ?? "")
                        .trim(),

                key:
                    (row.key ?? "")
                        .trim(),

                value:
                    row.value ?? "",

                description:
                    row.description ?? "",

                image:
                    (row.image ?? "")
                        .trim()
            };
        });
}


/**
 * 最後に使用していたTextEditorへPrompt挿入
 */
async function insertText(text) {

    const editor =
        lastActiveEditor;


    if (
        !editor ||
        editor.document.isClosed
    ) {

        vscode.window.showErrorMessage(
            "挿入先のエディタがありません。"
        );

        return;
    }


    await editor.edit(
        editBuilder => {

            for (
                const selection
                of editor.selections
            ) {

                editBuilder.replace(
                    selection,
                    text
                );
            }
        }
    );


    // INSERT後にエディタへ戻す
    await vscode.window.showTextDocument(
        editor.document,
        {
            viewColumn:
                editor.viewColumn,

            preserveFocus: false,

            selection:
                editor.selection
        }
    );
}


/**
 * Webview HTML
 */
function getHtml(
    webview,
    prompts
) {

    // </script>等がPrompt内にあっても
    // HTMLを壊さないようにする
    const dataJson =
        JSON.stringify(prompts)
            .replace(
                /</g,
                "\\u003c"
            );


    return `
<!DOCTYPE html>

<html lang="ja">

<head>

<meta charset="UTF-8">


<meta
    http-equiv="Content-Security-Policy"
    content="
        default-src 'none';
        img-src ${webview.cspSource} https: data: blob:;
        style-src 'unsafe-inline';
        script-src 'unsafe-inline';
    "
>


<style>

/* -------------------------
   Base
------------------------- */

body {

    font-family:
        var(--vscode-font-family);

    color:
        var(--vscode-foreground);

    background:
        var(--vscode-editor-background);

    padding: 16px;

    margin: 0;
}


/* -------------------------
   Toolbar
------------------------- */

.toolbar {

    position: sticky;

    top: 0;

    background:
        var(--vscode-editor-background);

    padding:
        12px 0;

    z-index: 100;
}


input {

    box-sizing:
        border-box;

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

    outline: none;
}


input:focus {

    border-color:
        var(--vscode-focusBorder);
}


/* -------------------------
   Category
------------------------- */

.category-section {

    margin-bottom: 32px;
}


.category-title {

    position: sticky;

    top: 58px;

    z-index: 50;

    padding:
        8px 4px;

    margin:
        12px 0 0;

    font-size: 18px;

    font-weight: bold;

    background:
        var(--vscode-editor-background);

    border-bottom:
        1px solid
        var(--vscode-panel-border);
}


/* -------------------------
   Card
------------------------- */

.card {

    display: grid;

    grid-template-columns:
        160px 1fr;

    gap: 14px;

    padding:
        12px 0;

    border-bottom:
        1px solid
        var(--vscode-panel-border);
}


/* -------------------------
   Thumbnail
------------------------- */

.thumbnail-box {

    width: 150px;

    min-height: 110px;

    display: flex;

    align-items: center;

    justify-content: center;

    background:
        var(--vscode-editorWidget-background);

    overflow: hidden;
}


.thumbnail {

    width: 150px;

    height: 110px;

    object-fit: contain;

    display: block;
}


.image-error {

    font-size: 11px;

    opacity: 0.6;

    text-align: center;

    padding: 8px;
}


/* -------------------------
   Prompt info
------------------------- */

.key {

    font-size: 16px;

    font-weight: bold;

    margin:
        0 0 6px;
}


.description {

    font-size: 12px;

    opacity: 0.75;

    margin-bottom: 8px;

    white-space: pre-wrap;
}


.value {

    white-space: pre-wrap;

    word-break: break-word;

    margin-bottom: 10px;

    line-height: 1.45;
}


/* -------------------------
   Button
------------------------- */

button {

    margin-right: 8px;

    padding:
        5px 12px;

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


/* -------------------------
   Empty
------------------------- */

.empty {

    opacity: 0.6;

    padding: 20px 0;
}

</style>

</head>


<body>


<div class="toolbar">

    <input
        id="search"
        type="text"
        placeholder="Key / Category / Prompt を検索..."
    >

</div>


<div id="list"></div>


<script>

const vscode =
    acquireVsCodeApi();


const prompts =
    ${dataJson};


const list =
    document.getElementById(
        "list"
    );


const search =
    document.getElementById(
        "search"
    );


/**
 * Render
 */
function render(
    filter = ""
) {

    const keyword =
        filter
            .toLowerCase()
            .trim();


    list.innerHTML = "";


    // -------------------------
    // Filter
    // -------------------------

    const filtered =
        prompts.filter(item => {

            const target = [

                item.category || "",

                item.key || "",

                item.value || "",

                item.description || ""

            ]
            .join(" ")
            .toLowerCase();


            return target.includes(
                keyword
            );
        });


    if (
        filtered.length === 0
    ) {

        const empty =
            document.createElement(
                "div"
            );

        empty.className =
            "empty";

        empty.textContent =
            "該当するPromptがありません。";

        list.appendChild(
            empty
        );

        return;
    }


    // -------------------------
    // Category grouping
    // -------------------------

    const grouped = {};


    for (
        const item
        of filtered
    ) {

        const category =
            item.category ||
            "未分類";


        if (
            !grouped[category]
        ) {

            grouped[category] = [];
        }


        grouped[category].push(
            item
        );
    }


    // TSV記載順を維持
    for (
        const [
            categoryName,
            items
        ]
        of Object.entries(grouped)
    ) {

        const section =
            document.createElement(
                "div"
            );

        section.className =
            "category-section";


        // -------------------------
        // Category title
        // -------------------------

        const title =
            document.createElement(
                "div"
            );

        title.className =
            "category-title";

        title.textContent =
            categoryName;


        section.appendChild(
            title
        );


        // -------------------------
        // Cards
        // -------------------------

        for (
            const item
            of items
        ) {

            const card =
                document.createElement(
                    "div"
                );

            card.className =
                "card";


            // -------------------------
            // Thumbnail
            // -------------------------

            const thumbnailBox =
                document.createElement(
                    "div"
                );

            thumbnailBox.className =
                "thumbnail-box";


            if (item.image) {

                const image =
                    document.createElement(
                        "img"
                    );


                image.className =
                    "thumbnail";


                // 大量画像用
                image.loading =
                    "lazy";


                // Dropbox等で
                // Webview固有Refererを送らない
                image.referrerPolicy =
                    "no-referrer";


                console.log(
                    "[Prompt Picker] THUMBNAIL:",
                    item.key,
                    item.image
                );


                image.onload = () => {

                    console.log(
                        "[Prompt Picker] IMAGE OK:",
                        item.key,
                        item.image
                    );
                };


                image.onerror = event => {

                    console.error(
                        "[Prompt Picker] IMAGE ERROR:",
                        item.key,
                        item.image,
                        event
                    );


                    image.remove();


                    const errorText =
                        document.createElement(
                            "div"
                        );

                    errorText.className =
                        "image-error";

                    errorText.textContent =
                        "IMAGE ERROR";


                    thumbnailBox.appendChild(
                        errorText
                    );
                };


                // 最後にsrcを設定
                image.src =
                    item.image;


                thumbnailBox.appendChild(
                    image
                );
            }
            else {

                const noImage =
                    document.createElement(
                        "div"
                    );

                noImage.className =
                    "image-error";

                noImage.textContent =
                    "NO IMAGE";


                thumbnailBox.appendChild(
                    noImage
                );
            }


            // -------------------------
            // Content
            // -------------------------

            const content =
                document.createElement(
                    "div"
                );


            const key =
                document.createElement(
                    "div"
                );

            key.className =
                "key";

            key.textContent =
                item.key || "";


            content.appendChild(
                key
            );


            // Descriptionは存在する場合だけ
            if (
                item.description
            ) {

                const description =
                    document.createElement(
                        "div"
                    );

                description.className =
                    "description";

                description.textContent =
                    item.description;


                content.appendChild(
                    description
                );
            }


            const value =
                document.createElement(
                    "div"
                );

            value.className =
                "value";

            value.textContent =
                item.value || "";


            content.appendChild(
                value
            );


            // -------------------------
            // COPY
            // -------------------------

            const copy =
                document.createElement(
                    "button"
                );

            copy.textContent =
                "COPY";


            copy.onclick = () => {

                vscode.postMessage({

                    command: "copy",

                    value:
                        item.value
                });
            };


            // -------------------------
            // INSERT
            // -------------------------

            const insert =
                document.createElement(
                    "button"
                );

            insert.textContent =
                "INSERT";


            insert.onclick = () => {

                vscode.postMessage({

                    command: "insert",

                    value:
                        item.value
                });
            };


            content.appendChild(
                copy
            );

            content.appendChild(
                insert
            );


            // -------------------------
            // Card
            // -------------------------

            card.appendChild(
                thumbnailBox
            );

            card.appendChild(
                content
            );


            section.appendChild(
                card
            );
        }


        list.appendChild(
            section
        );
    }
}


/**
 * Search
 */
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


/**
 * Extension deactivate
 */
function deactivate() {}


module.exports = {
    activate,
    deactivate
};