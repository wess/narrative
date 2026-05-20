# Tutorial 6 — Writing your first plugin

Narrative's plugin API is **Obsidian-compatible**, so writing a plugin will
feel familiar if you've ever touched the Obsidian ecosystem — and the skills
transfer in both directions. In this final tutorial you'll build a working
plugin from scratch and load it into Narrative.

For the conceptual overview, see the **[Plugins guide](../plugins.md)**.

## What we'll build

A small plugin called **Word Count** that:

- adds a ribbon icon that shows how many words are in the current page,
- adds a command to the command palette,
- exposes a setting,
- styles a custom Markdown code block.

## Step 1 — Find the plugins folder

Open **Settings → Plugins** (`⌘,`) and click **Open plugins folder**. Your file
manager opens Narrative's plugins directory. Plugins are **app-global** — they
live here, not inside any one vault.

Inside it, create a new folder for your plugin:

```
wordcount/
```

## Step 2 — Write the manifest

A plugin needs a `manifest.json`. Create `wordcount/manifest.json`:

```json
{
  "id": "wordcount",
  "name": "Word Count",
  "version": "1.0.0",
  "minAppVersion": "1.0.0",
  "description": "Counts the words in the current page.",
  "author": "Your Name",
  "isDesktopOnly": false
}
```

The `id` must be unique and is how Narrative tracks the plugin.

## Step 3 — Write the plugin code

The plugin itself is `main.js` — a **CommonJS module** that exports a plugin
class. (Plugins are the one place Narrative uses classes — the Obsidian API
requires it.) Create `wordcount/main.js`:

```js
"use strict";
const obsidian = require("obsidian");

const DEFAULT_SETTINGS = { label: "words" };

class WordCountPlugin extends obsidian.Plugin {
  async onload() {
    // Load saved settings, falling back to defaults.
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    // A ribbon icon in the top bar.
    this.addRibbonIcon("calculator", "Count words in this page", () => {
      const file = this.app.workspace.getActiveFile();
      if (!file) {
        new obsidian.Notice("No page is open.");
        return;
      }
      this.app.vault.read(file).then((text) => {
        const count = text.trim().split(/\s+/).filter(Boolean).length;
        new obsidian.Notice(count + " " + this.settings.label);
      });
    });

    // A command — it shows up in the command palette (Cmd-K).
    this.addCommand({
      id: "count-vault-words",
      name: "Count words across the whole vault",
      callback: async () => {
        const files = this.app.vault.getMarkdownFiles();
        let total = 0;
        for (const f of files) {
          const text = await this.app.vault.read(f);
          total += text.trim().split(/\s+/).filter(Boolean).length;
        }
        new obsidian.Notice("Vault total: " + total + " " + this.settings.label);
      },
    });

    // A code-block processor: a fenced ```wordcount block renders a card.
    this.registerMarkdownCodeBlockProcessor("wordcount", (source, el) => {
      const count = source.trim().split(/\s+/).filter(Boolean).length;
      const box = el.createDiv({ cls: "wordcount-box" });
      box.setText(count + " " + this.settings.label);
    });

    // A settings tab under Settings.
    this.addSettingTab(new WordCountSettingTab(this.app, this));

    console.log("[wordcount] loaded");
  }

  onunload() {
    console.log("[wordcount] unloaded");
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class WordCountSettingTab extends obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new obsidian.Setting(containerEl).setName("Word Count").setHeading();

    new obsidian.Setting(containerEl)
      .setName("Unit label")
      .setDesc("The word shown after a count.")
      .addText((text) =>
        text
          .setPlaceholder("words")
          .setValue(this.plugin.settings.label)
          .onChange(async (value) => {
            this.plugin.settings.label = value || "words";
            await this.plugin.saveSettings();
          }),
      );
  }
}

module.exports = WordCountPlugin;
```

A few things to notice:

- `onload` is where you register everything; `onunload` is for any manual
  cleanup. Everything registered through `addCommand`, `addRibbonIcon`,
  `registerMarkdownCodeBlockProcessor`, and so on is **torn down automatically**
  when the plugin is disabled.
- `this.app.vault` is the real, file-backed vault — `read`, `getMarkdownFiles`,
  and the rest operate on actual `.md` files.
- `loadData` / `saveData` persist to a `data.json` next to your `main.js`.

## Step 4 — Add styles (optional)

Create `wordcount/styles.css` to style the code-block card:

```css
.wordcount-box {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 6px;
  background: var(--accent-soft, rgba(0, 0, 0, 0.05));
  border: 1px solid var(--border, rgba(0, 0, 0, 0.12));
  font-size: 13px;
}
```

CSS is injected while the plugin is enabled and removed when it's disabled.

Your folder should now look like:

```
wordcount/
  manifest.json
  main.js
  styles.css
```

## Step 5 — Enable the plugin

Back in **Settings → Plugins**, your *Word Count* plugin now appears in the
list (Narrative rescans the folder). **Enable** it.

It loads immediately — no restart. If anything is wrong, the error is shown
right there in Settings instead of crashing the app.

## Step 6 — Try it

- Open a page and click the **calculator** ribbon icon — a notice shows the
  word count.
- Press `⌘K` and run **"Count words across the whole vault."**
- Add a fenced block to a page and watch it render as a styled card:

  ````
  ```wordcount
  one two three four five
  ```
  ````

- Open **Settings → Plugins → Word Count** and change the unit label.

## Step 7 — Iterate

Edit `main.js`, then **disable and re-enable** the plugin in Settings to reload
it. Use `console.log` for debugging — output appears in the developer console.

## Where to go further

The plugin API is broad. Beyond what you used here:

- `Modal`, `SuggestModal`, `FuzzySuggestModal` — dialogs and pickers.
- `MetadataCache` — headings, links, tags, and front-matter for any page.
- `Workspace` events — react to the active file changing.
- `requestUrl` — make HTTP requests from plugin code.
- `MarkdownRenderer`, custom views, status-bar items, and more.

Be mindful of the **[known limits](../plugins.md#known-limits)**: plugins run
in the webview, so there's no Node `fs` or `child_process` — use the `vault`
API and `requestUrl` instead.

The best reference is the built-in **Sample Plugin**, seeded into your plugins
folder on first run. It exercises commands, the ribbon, the status bar,
settings, vault events, and a code-block processor — read its source side by
side with the [Plugins guide](../plugins.md).

## What you learned

- A plugin is a folder: `manifest.json`, `main.js` (CommonJS), and optional
  `styles.css` / `data.json`.
- `require("obsidian")` gives you the Obsidian-compatible API.
- `onload` registers commands, ribbon icons, settings, and processors — all
  cleaned up automatically on disable.
- Plugins enable and reload live from **Settings → Plugins**.

## Done!

You've gone from installing Narrative to writing a working plugin. From here,
the **[documentation guides](../readme.md)** cover everything in reference
depth. Happy writing.
