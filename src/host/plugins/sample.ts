// A built-in sample plugin, seeded into the plugins folder on first run so
// there's something real to look at — and so the whole pipeline (manifest →
// CommonJS loader → plugin API module → registries → UI) is exercised end
// to end. It's authored against the exact plugin API a community plugin uses:
// `Plugin`, `addCommand`, `addRibbonIcon`, `addStatusBarItem`,
// `registerMarkdownCodeBlockProcessor`, `Setting` / `PluginSettingTab`, and
// the `vault` API + events.

import { join } from "node:path";
import { scanPlugins } from "./scan.ts";

const SAMPLE_ID = "bethink-hello";
const SAMPLE_DIR = "helloplugin";

const MANIFEST = JSON.stringify(
  {
    id: SAMPLE_ID,
    name: "Sample Plugin",
    version: "1.0.0",
    minAppVersion: "1.0.0",
    description:
      "A built-in sample that exercises commands, the ribbon, the status bar, settings, the vault API, and a markdown code-block processor.",
    author: "Bethink",
    isDesktopOnly: false,
  },
  null,
  2,
);

const STYLES = `.hello-codeblock {
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--accent-soft, rgba(0, 0, 0, 0.05));
  border: 1px solid var(--border, rgba(0, 0, 0, 0.12));
  font-size: 13px;
}
.hello-codeblock strong {
  display: block;
  margin-bottom: 4px;
}
`;

// The plugin itself — plain CommonJS, exactly like a published community
// plugin's bundled `main.js`.
const MAIN_JS = `"use strict";
const obsidian = require("obsidian");

const DEFAULT_SETTINGS = { greeting: "Hello", showStatus: true };

class HelloPlugin extends obsidian.Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    // Ribbon icon — shows up in the topbar.
    this.addRibbonIcon("sparkles", "Sample plugin: say hello", () => {
      new obsidian.Notice(this.settings.greeting + " from the Bethink plugin system!");
    });

    // Status bar item.
    if (this.settings.showStatus) {
      const status = this.addStatusBarItem();
      status.setText("\\u2726 sample plugin active");
    }

    // Commands — these land in the command palette.
    this.addCommand({
      id: "insert-greeting",
      name: "Insert greeting into current page",
      editorCallback: (editor) => {
        editor.replaceSelection("\\n" + this.settings.greeting + ", world!\\n");
        new obsidian.Notice("Inserted a greeting.");
      },
    });

    this.addCommand({
      id: "count-pages",
      name: "Count pages in the vault",
      callback: () => {
        const count = this.app.vault.getMarkdownFiles().length;
        new obsidian.Notice("Your vault has " + count + " page(s).");
      },
    });

    // Markdown code-block processor: a fenced \\\`\\\`\\\`hello block renders as a card.
    this.registerMarkdownCodeBlockProcessor("hello", (source, el) => {
      const box = el.createDiv({ cls: "hello-codeblock" });
      box.createEl("strong", { text: this.settings.greeting + "!" });
      box.createEl("div", { text: source.trim() || "(empty hello block)" });
    });

    // React to vault changes.
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        console.log("[hello-plugin] page modified:", file.path);
      }),
    );

    // A settings tab under Settings.
    this.addSettingTab(new HelloSettingTab(this.app, this));

    console.log("[hello-plugin] loaded");
  }

  onunload() {
    console.log("[hello-plugin] unloaded");
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class HelloSettingTab extends obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const containerEl = this.containerEl;
    containerEl.empty();

    new obsidian.Setting(containerEl).setName("Sample plugin").setHeading();

    new obsidian.Setting(containerEl)
      .setName("Greeting")
      .setDesc("The word the ribbon button and commands use.")
      .addText((text) =>
        text
          .setPlaceholder("Hello")
          .setValue(this.plugin.settings.greeting)
          .onChange(async (value) => {
            this.plugin.settings.greeting = value || "Hello";
            await this.plugin.saveSettings();
          }),
      );

    new obsidian.Setting(containerEl)
      .setName("Show status bar item")
      .setDesc("Toggle the status bar indicator (applies on next reload).")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showStatus).onChange(async (value) => {
          this.plugin.settings.showStatus = value;
          await this.plugin.saveSettings();
        }),
      );
  }
}

module.exports = HelloPlugin;
`;

// Write the sample into the plugins folder once, and enable it, the first
// time Bethink runs. A `.seeded` marker file means we never fight a user
// who later removes or disables it. This runs *before* the plugins store is
// constructed, so it can write the enabled list straight to disk without
// racing the store's async load.
export const seedSamplePlugin = async (root: string, storeFilePath: string): Promise<void> => {
  const marker = join(root, ".seeded");
  if (await Bun.file(marker).exists()) return;

  // Mark seeded up front so a mid-seed failure can't loop on every launch.
  await Bun.write(marker, new Date().toISOString());

  // Respect a user who already dropped in their own plugins — seed nothing.
  const existing = await scanPlugins(root);
  if (existing.length > 0) return;

  const dir = join(root, SAMPLE_DIR);
  await Bun.write(join(dir, "manifest.json"), MANIFEST);
  await Bun.write(join(dir, "main.js"), MAIN_JS);
  await Bun.write(join(dir, "styles.css"), STYLES);

  // Enable the sample by writing the plugins store file directly.
  let prefs: Record<string, unknown> = {};
  try {
    prefs = (await Bun.file(storeFilePath).json()) as Record<string, unknown>;
  } catch {
    // no plugins store yet — first run
  }
  const enabled = Array.isArray(prefs.enabled) ? (prefs.enabled as string[]) : [];
  if (!enabled.includes(SAMPLE_ID)) enabled.push(SAMPLE_ID);
  prefs.enabled = enabled;
  await Bun.write(storeFilePath, JSON.stringify(prefs, null, 2));
};
