// `Setting` — the fluent settings-row builder — plus the input
// components it wires up (`TextComponent`, `ToggleComponent`, …) and the
// `PluginSettingTab` base a plugin extends to render its preferences. Every
// component owns a real DOM input so a plugin can reach in and tweak it.

import type { App } from "./app.ts";
import { setIcon } from "./icons.ts";
import type { Plugin } from "./plugin.ts";

// --- components -----------------------------------------------------------

export class BaseComponent {
  disabled = false;

  setDisabled(disabled: boolean): this {
    this.disabled = disabled;
    return this;
  }

  // biome-ignore lint/suspicious/noThenProperty: matches the plugin BaseComponent API
  then(cb: (component: this) => unknown): this {
    cb(this);
    return this;
  }
}

export class ValueComponent<T> extends BaseComponent {
  getValue(): T {
    throw new Error("getValue not implemented");
  }
  setValue(_value: T): this {
    return this;
  }
  registerOptionListener(listeners: Record<string, (value?: T) => T>, key: string): this {
    void listeners;
    void key;
    return this;
  }
}

export class TextComponent extends ValueComponent<string> {
  inputEl: HTMLInputElement;
  private _changeCb: ((value: string) => unknown) | null = null;

  constructor(containerEl: HTMLElement) {
    super();
    this.inputEl = containerEl.createEl("input", { type: "text" });
    this.inputEl.addEventListener("input", () => this._changeCb?.(this.inputEl.value));
  }
  override getValue(): string {
    return this.inputEl.value;
  }
  override setValue(value: string): this {
    this.inputEl.value = value;
    return this;
  }
  setPlaceholder(placeholder: string): this {
    this.inputEl.placeholder = placeholder;
    return this;
  }
  override setDisabled(disabled: boolean): this {
    this.inputEl.disabled = disabled;
    return super.setDisabled(disabled);
  }
  onChange(cb: (value: string) => unknown): this {
    this._changeCb = cb;
    return this;
  }
  onChanged(): void {
    this._changeCb?.(this.inputEl.value);
  }
}

export class TextAreaComponent extends ValueComponent<string> {
  inputEl: HTMLTextAreaElement;
  private _changeCb: ((value: string) => unknown) | null = null;

  constructor(containerEl: HTMLElement) {
    super();
    this.inputEl = containerEl.createEl("textarea");
    this.inputEl.addEventListener("input", () => this._changeCb?.(this.inputEl.value));
  }
  override getValue(): string {
    return this.inputEl.value;
  }
  override setValue(value: string): this {
    this.inputEl.value = value;
    return this;
  }
  setPlaceholder(placeholder: string): this {
    this.inputEl.placeholder = placeholder;
    return this;
  }
  onChange(cb: (value: string) => unknown): this {
    this._changeCb = cb;
    return this;
  }
}

export class SearchComponent extends TextComponent {
  clearButtonEl: HTMLElement;
  constructor(containerEl: HTMLElement) {
    super(containerEl);
    this.inputEl.addClass("narrative-search-input");
    this.clearButtonEl = containerEl.createEl("div", { cls: "narrative-search-clear" });
    this.clearButtonEl.addEventListener("click", () => {
      this.setValue("");
      this.onChanged();
    });
  }
}

export class MomentFormatComponent extends TextComponent {
  sampleEl: HTMLElement | null = null;
  defaultFormat = "YYYY-MM-DD";
  setDefaultFormat(format: string): this {
    this.defaultFormat = format;
    this.inputEl.placeholder = format;
    return this;
  }
  setSampleEl(sampleEl: HTMLElement): this {
    this.sampleEl = sampleEl;
    return this;
  }
}

export class ToggleComponent extends ValueComponent<boolean> {
  toggleEl: HTMLElement;
  private _input: HTMLInputElement;
  private _changeCb: ((value: boolean) => unknown) | null = null;

  constructor(containerEl: HTMLElement) {
    super();
    this.toggleEl = containerEl.createDiv({ cls: "narrative-toggle" });
    this._input = this.toggleEl.createEl("input", { type: "checkbox" });
    this._input.addEventListener("change", () => {
      this.toggleEl.toggleClass("is-enabled", this._input.checked);
      this._changeCb?.(this._input.checked);
    });
  }
  override getValue(): boolean {
    return this._input.checked;
  }
  override setValue(value: boolean): this {
    this._input.checked = value;
    this.toggleEl.toggleClass("is-enabled", value);
    return this;
  }
  override setDisabled(disabled: boolean): this {
    this._input.disabled = disabled;
    return super.setDisabled(disabled);
  }
  setTooltip(tooltip: string): this {
    this.toggleEl.title = tooltip;
    return this;
  }
  onChange(cb: (value: boolean) => unknown): this {
    this._changeCb = cb;
    return this;
  }
}

export class DropdownComponent extends ValueComponent<string> {
  selectEl: HTMLSelectElement;
  private _changeCb: ((value: string) => unknown) | null = null;

  constructor(containerEl: HTMLElement) {
    super();
    this.selectEl = containerEl.createEl("select", { cls: "narrative-dropdown" });
    this.selectEl.addEventListener("change", () => this._changeCb?.(this.selectEl.value));
  }
  addOption(value: string, display: string): this {
    const opt = this.selectEl.createEl("option", { text: display });
    opt.value = value;
    return this;
  }
  addOptions(options: Record<string, string>): this {
    for (const [value, display] of Object.entries(options)) this.addOption(value, display);
    return this;
  }
  override getValue(): string {
    return this.selectEl.value;
  }
  override setValue(value: string): this {
    this.selectEl.value = value;
    return this;
  }
  override setDisabled(disabled: boolean): this {
    this.selectEl.disabled = disabled;
    return super.setDisabled(disabled);
  }
  onChange(cb: (value: string) => unknown): this {
    this._changeCb = cb;
    return this;
  }
}

export class SliderComponent extends ValueComponent<number> {
  sliderEl: HTMLInputElement;
  private _changeCb: ((value: number) => unknown) | null = null;

  constructor(containerEl: HTMLElement) {
    super();
    this.sliderEl = containerEl.createEl("input", { type: "range" });
    this.sliderEl.addEventListener("input", () => this._changeCb?.(this.getValue()));
  }
  setLimits(min: number, max: number, step: number): this {
    this.sliderEl.min = String(min);
    this.sliderEl.max = String(max);
    this.sliderEl.step = String(step);
    return this;
  }
  override getValue(): number {
    return Number(this.sliderEl.value);
  }
  override setValue(value: number): this {
    this.sliderEl.value = String(value);
    return this;
  }
  setDynamicTooltip(): this {
    return this;
  }
  showTooltip(): this {
    return this;
  }
  override setDisabled(disabled: boolean): this {
    this.sliderEl.disabled = disabled;
    return super.setDisabled(disabled);
  }
  onChange(cb: (value: number) => unknown): this {
    this._changeCb = cb;
    return this;
  }
}

export class ColorComponent extends ValueComponent<string> {
  private _input: HTMLInputElement;
  private _changeCb: ((value: string) => unknown) | null = null;

  constructor(containerEl: HTMLElement) {
    super();
    this._input = containerEl.createEl("input", { type: "color", cls: "narrative-color" });
    this._input.addEventListener("input", () => this._changeCb?.(this._input.value));
  }
  override getValue(): string {
    return this._input.value;
  }
  override setValue(value: string): this {
    this._input.value = value;
    return this;
  }
  onChange(cb: (value: string) => unknown): this {
    this._changeCb = cb;
    return this;
  }
}

export class ButtonComponent extends BaseComponent {
  buttonEl: HTMLButtonElement;
  private _click: ((evt: MouseEvent) => unknown) | null = null;

  constructor(containerEl: HTMLElement) {
    super();
    this.buttonEl = containerEl.createEl("button", { cls: "narrative-setting-button" });
    this.buttonEl.addEventListener("click", (e) => this._click?.(e));
  }
  setButtonText(name: string): this {
    this.buttonEl.setText(name);
    return this;
  }
  setIcon(icon: string): this {
    setIcon(this.buttonEl, icon);
    return this;
  }
  setTooltip(tooltip: string): this {
    this.buttonEl.title = tooltip;
    return this;
  }
  setClass(cls: string): this {
    this.buttonEl.addClass(cls);
    return this;
  }
  setCta(): this {
    this.buttonEl.addClass("mod-cta");
    return this;
  }
  removeCta(): this {
    this.buttonEl.removeClass("mod-cta");
    return this;
  }
  setWarning(): this {
    this.buttonEl.addClass("mod-warning");
    return this;
  }
  override setDisabled(disabled: boolean): this {
    this.buttonEl.disabled = disabled;
    return super.setDisabled(disabled);
  }
  onClick(cb: (evt: MouseEvent) => unknown): this {
    this._click = cb;
    return this;
  }
}

export class ExtraButtonComponent extends BaseComponent {
  extraSettingsEl: HTMLElement;
  private _click: (() => unknown) | null = null;

  constructor(containerEl: HTMLElement) {
    super();
    this.extraSettingsEl = containerEl.createDiv({ cls: "narrative-extra-button" });
    this.extraSettingsEl.addEventListener("click", () => this._click?.());
  }
  setIcon(icon: string): this {
    setIcon(this.extraSettingsEl, icon);
    return this;
  }
  setTooltip(tooltip: string): this {
    this.extraSettingsEl.title = tooltip;
    return this;
  }
  override setDisabled(disabled: boolean): this {
    this.extraSettingsEl.toggleClass("is-disabled", disabled);
    return super.setDisabled(disabled);
  }
  onClick(cb: () => unknown): this {
    this._click = cb;
    return this;
  }
}

export class ProgressBarComponent extends ValueComponent<number> {
  private _bar: HTMLElement;
  private _fill: HTMLElement;

  constructor(containerEl: HTMLElement) {
    super();
    this._bar = containerEl.createDiv({ cls: "narrative-progress" });
    this._fill = this._bar.createDiv({ cls: "narrative-progress-fill" });
  }
  override getValue(): number {
    return Number.parseFloat(this._fill.style.width) || 0;
  }
  override setValue(value: number): this {
    this._fill.style.width = `${Math.max(0, Math.min(100, value))}%`;
    return this;
  }
}

// --- Setting --------------------------------------------------------------

export class Setting {
  settingEl: HTMLElement;
  infoEl: HTMLElement;
  nameEl: HTMLElement;
  descEl: HTMLElement;
  controlEl: HTMLElement;
  components: BaseComponent[] = [];

  constructor(containerEl: HTMLElement) {
    this.settingEl = containerEl.createDiv({ cls: "narrative-setting-item" });
    this.infoEl = this.settingEl.createDiv({ cls: "narrative-setting-item-info" });
    this.nameEl = this.infoEl.createDiv({ cls: "narrative-setting-item-name" });
    this.descEl = this.infoEl.createDiv({ cls: "narrative-setting-item-description" });
    this.controlEl = this.settingEl.createDiv({ cls: "narrative-setting-item-control" });
  }

  setName(name: string | DocumentFragment): this {
    this.nameEl.empty();
    if (typeof name === "string") this.nameEl.setText(name);
    else this.nameEl.appendChild(name);
    return this;
  }

  setDesc(desc: string | DocumentFragment): this {
    this.descEl.empty();
    if (typeof desc === "string") this.descEl.setText(desc);
    else this.descEl.appendChild(desc);
    return this;
  }

  setClass(cls: string): this {
    this.settingEl.addClass(cls);
    return this;
  }

  setTooltip(tooltip: string): this {
    this.settingEl.title = tooltip;
    return this;
  }

  setHeading(): this {
    this.settingEl.addClass("narrative-setting-heading");
    return this;
  }

  setDisabled(disabled: boolean): this {
    this.settingEl.toggleClass("is-disabled", disabled);
    return this;
  }

  clear(): this {
    this.controlEl.empty();
    this.components = [];
    return this;
  }

  private add<T extends BaseComponent>(component: T, cb: (c: T) => unknown): this {
    this.components.push(component);
    cb(component);
    return this;
  }

  addText(cb: (text: TextComponent) => unknown): this {
    return this.add(new TextComponent(this.controlEl), cb);
  }
  addTextArea(cb: (text: TextAreaComponent) => unknown): this {
    return this.add(new TextAreaComponent(this.controlEl), cb);
  }
  addSearch(cb: (search: SearchComponent) => unknown): this {
    return this.add(new SearchComponent(this.controlEl), cb);
  }
  addMomentFormat(cb: (component: MomentFormatComponent) => unknown): this {
    return this.add(new MomentFormatComponent(this.controlEl), cb);
  }
  addToggle(cb: (toggle: ToggleComponent) => unknown): this {
    return this.add(new ToggleComponent(this.controlEl), cb);
  }
  addDropdown(cb: (dropdown: DropdownComponent) => unknown): this {
    return this.add(new DropdownComponent(this.controlEl), cb);
  }
  addSlider(cb: (slider: SliderComponent) => unknown): this {
    return this.add(new SliderComponent(this.controlEl), cb);
  }
  addColorPicker(cb: (color: ColorComponent) => unknown): this {
    return this.add(new ColorComponent(this.controlEl), cb);
  }
  addButton(cb: (button: ButtonComponent) => unknown): this {
    return this.add(new ButtonComponent(this.controlEl), cb);
  }
  addExtraButton(cb: (button: ExtraButtonComponent) => unknown): this {
    return this.add(new ExtraButtonComponent(this.controlEl), cb);
  }
  addProgressBar(cb: (bar: ProgressBarComponent) => unknown): this {
    return this.add(new ProgressBarComponent(this.controlEl), cb);
  }

  // biome-ignore lint/suspicious/noThenProperty: matches the plugin Setting API
  then(cb: (setting: this) => unknown): this {
    cb(this);
    return this;
  }
}

// --- SettingTab / PluginSettingTab ---------------------------------------

export class SettingTab {
  app: App;
  containerEl: HTMLElement;

  constructor(app: App) {
    this.app = app;
    this.containerEl = document.createElement("div");
    this.containerEl.className = "narrative-plugin-settings";
  }

  display(): void {}
  hide(): void {
    this.containerEl.empty();
  }
}

export class PluginSettingTab extends SettingTab {
  plugin: Plugin;

  constructor(app: App, plugin: Plugin) {
    super(app);
    this.plugin = plugin;
  }
}
