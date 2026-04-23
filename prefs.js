import Adw from "gi://Adw";
import Gdk from "gi://Gdk";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Gtk from "gi://Gtk";

import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

import * as Utils from "./src/utils.js";
import { Fields } from "./src/config/constants.js";
import * as Languages from "./src/languages.js";

const COLOR_KEYS = {
  "highlight-fill-color": "Fill color",
  "highlight-border-color": "Border color",
};

const DEFAULTS = {
  "highlight-fill-color": "0.10,0.11,0.13,0.34",
  "highlight-border-color": "0.92,0.94,0.97,0.34",
};

export default class ShotzyPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    const settings = this.getSettings();
    const dependencyState = this._getDependencyState();

    window.set_default_size(720, 640);

    // stylepage
    const stylePage = new Adw.PreferencesPage({
      title: "Highlighting",
      icon_name: "preferences-desktop-theme-symbolic",
    });
    window.add(stylePage);

    const dependencyRow = this._createDependencyRow(dependencyState);
    if (dependencyRow) {
      const dependencyGroup = new Adw.PreferencesGroup();
      dependencyGroup.add(dependencyRow);
      stylePage.add(dependencyGroup);
    }

    const styleGroup = new Adw.PreferencesGroup({
      title: "Appearance",
      description: "Controls for OCR highlight styling in the screenshot UI.",
    });
    stylePage.add(styleGroup);

    for (const [key, title] of Object.entries(COLOR_KEYS))
      styleGroup.add(this._createColorRow(settings, key, title));

    styleGroup.add(
      this._createSpinRow(settings, {
        key: "highlight-padding",
        title: "Box padding",
        subtitle: "Extra room around each detected text box.",
        min: 0,
        max: 16,
        step: 1,
      }),
    );
    styleGroup.add(
      this._createSpinRow(settings, {
        key: "highlight-radius",
        title: "Corner radius",
        subtitle: "Roundedness of the highlight shape.",
        min: 0,
        max: 24,
        step: 1,
      }),
    );
    styleGroup.add(
      this._createSpinRow(settings, {
        key: "highlight-border-width",
        title: "Border width",
        subtitle: "Outline thickness of each highlight box.",
        min: 0.5,
        max: 4,
        step: 0.25,
        digits: 2,
        isDouble: true,
      }),
    );
    styleGroup.add(
      this._createSpinRow(settings, {
        key: "highlight-shadow-opacity",
        title: "Shadow opacity",
        subtitle: "Depth under the highlight boxes.",
        min: 0,
        max: 0.5,
        step: 0.01,
        digits: 2,
        isDouble: true,
      }),
    );

    // ocrpage
    const ocrPage = new Adw.PreferencesPage({
      title: "OCR",
      icon_name: "accessories-text-editor-symbolic",
    });
    window.add(ocrPage);

    const ocrGroup = new Adw.PreferencesGroup({
      title: "Recognition",
      description: "Controls for the single selected-area OCR pass.",
    });
    ocrPage.add(ocrGroup);

    const enabledRow = new Adw.SwitchRow({
      title: "Enable OCR highlighting",
      subtitle:
        "Run OCR on the active screenshot selection and draw text highlights.",
    });
    settings.bind(
      "ocr-enabled",
      enabledRow,
      "active",
      Gio.SettingsBindFlags.DEFAULT,
    );
    ocrGroup.add(enabledRow);

    ocrGroup.add(
      this._createSpinRow(settings, {
        key: "selection-confidence",
        title: "OCR confidence",
        subtitle: "Lower values catch more text but increase false positives.",
        min: 0,
        max: 95,
        step: 1,
      }),
    );
    ocrGroup.add(
      this._createSpinRow(settings, {
        key: "selection-max-edge",
        title: "OCR max edge",
        subtitle:
          "Higher values improve selected-area accuracy but cost more CPU.",
        min: 1000,
        max: 4000,
        step: 100,
      }),
    );

    // searchpage
    const searchPage = new Adw.PreferencesPage({
      title: "Search",
      icon_name: "system-search-symbolic",
    });
    window.add(searchPage);

    const searchGroup = new Adw.PreferencesGroup({
      title: "Search Settings",
      description: "Configure how search results are handled.",
    });
    searchPage.add(searchGroup);

    const searchEngineRow = new Adw.ComboRow({
      title: "Search Engine",
      subtitle: "Preferred engine for looking up OCR text.",
      model: new Gtk.StringList({
        strings: ["Google", "Bing", "DuckDuckGo", "Kagi"],
      }),
    });

    const engines = ["google", "bing", "duckduckgo", "kagi"];
    const currentEngine = settings.get_string("search-engine");
    searchEngineRow.selected = Math.max(0, engines.indexOf(currentEngine));

    searchEngineRow.connect("notify::selected", () => {
      settings.set_string("search-engine", engines[searchEngineRow.selected]);
    });

    searchGroup.add(searchEngineRow);

    const actionsGroup = new Adw.PreferencesGroup({
      title: "Screenshot Actions",
      description: "Choose which extra buttons appear in the screenshot UI.",
    });
    searchPage.add(actionsGroup);

    const lensButtonRow = new Adw.SwitchRow({
      title: "Show Google Lens button",
      subtitle:
        "Display the Google Lens upload button beside the screenshot controls.",
    });
    settings.bind(
      "show-google-lens-button",
      lensButtonRow,
      "active",
      Gio.SettingsBindFlags.DEFAULT,
    );
    actionsGroup.add(lensButtonRow);

    const qrButtonRow = new Adw.SwitchRow({
      title: "Show QR code button",
      subtitle: "Display the QR scanning button in the screenshot controls.",
    });
    settings.bind(
      "show-qr-button",
      qrButtonRow,
      "active",
      Gio.SettingsBindFlags.DEFAULT,
    );
    actionsGroup.add(qrButtonRow);

    // translatepage
    const translatePage = new Adw.PreferencesPage({
      title: "Translate",
      icon_name: "accessories-text-editor-symbolic",
    });
    window.add(translatePage);

    const translateGroup = new Adw.PreferencesGroup({
      title: "Translate",
      description: "Controls for the single selected-area OCR pass.",
    });
    translatePage.add(translateGroup);

    const enabledBriefRow = new Adw.SwitchRow({
      title: "Enable brief-mode",
      subtitle: "brief-mode",
    });
    settings.bind(
      "brief-mode",
      enabledBriefRow,
      "active",
      Gio.SettingsBindFlags.DEFAULT,
    );
    translateGroup.add(enabledBriefRow);

    const enabledAutoCloseRow = new Adw.SwitchRow({
      title: "Enable auto-close",
      subtitle: "auto-close",
    });
    settings.bind(
      "auto-close",
      enabledAutoCloseRow,
      "active",
      Gio.SettingsBindFlags.DEFAULT,
    );
    translateGroup.add(enabledAutoCloseRow);

    let proxy = new Gtk.Entry({
      text: "",
      placeholder_text: "protocol://host:port",
      halign: Gtk.Align.END,
      valign: Gtk.Align.CENTER,
      width_chars: 25,
    });

    let proxyRow = new Adw.ActionRow({
      title: "Network proxy",
    });
    proxyRow.add_suffix(proxy);
    settings.bind("proxy", proxy, "text", Gio.SettingsBindFlags.DEFAULT);
    translateGroup.add(proxyRow);

    // 创建语言列表
    const langList = new Gtk.StringList();
    const langCodes = [];

    // 添加 "Auto" 选项（用于源语言和主要目标语言）
    langList.append("Auto");
    langCodes.push("auto");

    // 添加所有语言
    const isoLangs = Languages.isoLangs;
    const sortedKeys = Object.keys(isoLangs).sort((a, b) => {
      const nameA = isoLangs[a].name.toLowerCase();
      const nameB = isoLangs[b].name.toLowerCase();
      return nameA.localeCompare(nameB);
    });

    for (const langCode of sortedKeys) {
      const lang = isoLangs[langCode];
      langList.append(`${lang.name} (${langCode})`);
      langCodes.push(langCode);
    }
    // 源语言设置
    let fromRow = new Adw.ComboRow({
      title: "Source language",
      subtitle: "Language code (e.g., en, zh, auto for auto-detect)",
    });
    fromRow.set_model(langList);
    translateGroup.add(fromRow);
    this._onLanguageChanged(settings, fromRow, Fields.FROM, langCodes, true);

    settings.connect("changed::" + Fields.FROM, (settings, key) => {
      this._onLanguageChanged(settings, fromRow, Fields.FROM, langCodes, true);
    });
    fromRow.connect("notify::selected", () => {
      const selectedIndex = fromRow.get_selected();
      if (selectedIndex >= 0 && selectedIndex < langCodes.length) {
        settings.set_string(Fields.FROM, langCodes[selectedIndex]);
      }
    });

    // 目标语言设置
    let toPrimaryRow = new Adw.ComboRow({
      title: "Target language",
      subtitle: "Language code (e.g., en, zh, auto for auto-detect)",
    });
    toPrimaryRow.set_model(langList);
    translateGroup.add(toPrimaryRow);
    this._onLanguageChanged(
      settings,
      toPrimaryRow,
      Fields.TO_PRIMARY,
      langCodes,
      true,
    );

    settings.connect("changed::" + Fields.TO_PRIMARY, (settings, key) => {
      this._onLanguageChanged(
        settings,
        toPrimaryRow,
        Fields.TO_PRIMARY,
        langCodes,
        true,
      );
    });
    toPrimaryRow.connect("notify::selected", () => {
      const selectedIndex = toPrimaryRow.get_selected();
      if (selectedIndex >= 0 && selectedIndex < langCodes.length) {
        settings.set_string(Fields.TO_PRIMARY, langCodes[selectedIndex]);
      }
    });

    // 次要目标语言设置（包含 "None" 选项）
    const secondaryLangList = new Gtk.StringList();
    const secondaryLangCodes = [];

    // 添加 "None" 选项
    secondaryLangList.append("None");
    secondaryLangCodes.push("");

    // 添加所有语言（不包括 "Auto"）
    for (const langCode of sortedKeys) {
      const lang = isoLangs[langCode];
      secondaryLangList.append(`${lang.name} (${langCode})`);
      secondaryLangCodes.push(langCode);
    }

    let toSecondaryRow = new Adw.ComboRow({
      title: "Secondary target language",
      subtitle: "Secondary target language code (lower priority, optional)",
    });
    toSecondaryRow.set_model(secondaryLangList);
    translateGroup.add(toSecondaryRow);
    this._onLanguageChanged(
      settings,
      toSecondaryRow,
      Fields.TO_SECONDARY,
      secondaryLangCodes,
      false,
    );

    settings.connect("changed::" + Fields.TO_SECONDARY, (settings, key) => {
      this._onLanguageChanged(
        settings,
        toSecondaryRow,
        Fields.TO_SECONDARY,
        secondaryLangCodes,
        false,
      );
    });
    toSecondaryRow.connect("notify::selected", () => {
      const selectedIndex = toSecondaryRow.get_selected();
      if (selectedIndex >= 0 && selectedIndex < secondaryLangCodes.length) {
        settings.set_string(
          Fields.TO_SECONDARY,
          secondaryLangCodes[selectedIndex],
        );
      }
    });

    let engineRow = new Adw.ComboRow({
      title: "Engine",
      subtitle: "Translation engine",
    });
    const engineList = new Gtk.StringList();
    engineList.append("Google");
    engineList.append("LLM");

    engineRow.set_model(engineList);
    let engine = settings.get_string("engine");
    this._engine = engine;
    engineRow.set_selected(engine != "Google");

    settings.connect("changed::engine", (settings, key) => {
      this._onEngineChanged(engineRow);
    });
    engineRow.connect("notify::selected", () => {
      settings.set_string(
        "engine",
        engineList.get_string(engineRow.get_selected()),
      );
    });
    translateGroup.add(engineRow);

    window._settings = settings;
  }
  _onEngineChanged(row) {
    let engine = this._settings.get_string("engine");
    this._engine = engine;
    row.set_selected(engine != "Google");
  }
  _onLanguageChanged(settings, row, field, langCodes, hasAuto) {
    const _settings = settings;
    const currentValue = _settings.get_string(field) || (hasAuto ? "auto" : "");
    let index = langCodes.indexOf(currentValue);
    if (index === -1) {
      // 如果找不到，尝试查找默认值
      if (hasAuto && currentValue === "") {
        index = langCodes.indexOf("auto");
      } else if (!hasAuto && currentValue === "auto") {
        index = 0; // 选择 "None"
      } else {
        index = 0; // 默认选择第一个
      }
    }
    if (index >= 0 && index < langCodes.length) {
      row.set_selected(index);
    }
  }

  _getDependencyState() {
    const dependencies = [
      {
        program: "tesseract",
      },
      {
        program: "zbarimg",
      },
    ].map((item) => ({
      ...item,
      available: Boolean(GLib.find_program_in_path(item.program)),
    }));

    return {
      dependencies,
      missing: dependencies.filter((item) => !item.available),
    };
  }

  _createDependencyRow({ dependencies, missing }) {
    if (missing.length === 0) return null;

    const missingFeatures = [];
    if (missing.some((item) => item.program === "tesseract"))
      missingFeatures.push("OCR highlighting");
    if (missing.some((item) => item.program === "zbarimg"))
      missingFeatures.push("QR scanning");

    const tooltipLines = [
      "Runtime Dependencies",
      ...dependencies.map(
        (item) =>
          `${item.program}: ${item.available ? "Available" : "Missing"}`,
      ),
    ];

    const row = new Adw.ActionRow({
      title: `Optional tool missing: ${missing.map((item) => item.program).join(", ")}`,
      subtitle: `Install to enable ${missingFeatures.join(" and ")}.`,
      tooltip_text: tooltipLines.join("\n"),
    });
    row.add_prefix(
      new Gtk.Image({
        icon_name: "dialog-warning-symbolic",
        valign: Gtk.Align.CENTER,
      }),
    );

    row.add_suffix(
      new Gtk.Image({
        icon_name: "help-about-symbolic",
        tooltip_text: tooltipLines.join("\n"),
        valign: Gtk.Align.CENTER,
      }),
    );

    return row;
  }

  _createColorRow(settings, key, title) {
    const row = new Adw.ActionRow({
      title,
      subtitle: "Alpha is supported. Changes apply immediately.",
    });

    const button = new Gtk.ColorButton({
      use_alpha: true,
      rgba: _rgbaFromSetting(settings.get_string(key), DEFAULTS[key]),
      valign: Gtk.Align.CENTER,
    });
    button.connect("notify::rgba", () => {
      settings.set_string(key, _rgbaToSetting(button.get_rgba()));
    });

    const reset = new Gtk.Button({
      icon_name: "edit-undo-symbolic",
      tooltip_text: "Reset to default",
      valign: Gtk.Align.CENTER,
    });
    reset.connect("clicked", () => {
      settings.reset(key);
      button.set_rgba(
        _rgbaFromSetting(settings.get_string(key), DEFAULTS[key]),
      );
    });

    row.add_suffix(reset);
    row.add_suffix(button);
    row.activatable_widget = button;
    return row;
  }

  _createSpinRow(
    settings,
    { key, title, subtitle, min, max, step, digits = 0, isDouble = false },
  ) {
    const row = new Adw.SpinRow({
      title,
      subtitle,
      adjustment: new Gtk.Adjustment({
        lower: min,
        upper: max,
        step_increment: step,
        page_increment: step,
      }),
      digits,
    });

    row.set_value(isDouble ? settings.get_double(key) : settings.get_int(key));
    row.connect("notify::value", () => {
      if (isDouble) settings.set_double(key, row.get_value());
      else settings.set_int(key, Math.round(row.get_value()));
    });

    return row;
  }
}

function _rgbaFromSetting(value, fallback) {
  const rgba = new Gdk.RGBA();
  const source = (value || fallback).split(",").map(Number.parseFloat);
  const [red, green, blue, alpha] =
    source.length === 4 && source.every(Number.isFinite)
      ? source
      : fallback.split(",").map(Number.parseFloat);

  rgba.red = red;
  rgba.green = green;
  rgba.blue = blue;
  rgba.alpha = alpha;
  return rgba;
}

function _rgbaToSetting(rgba) {
  return [
    rgba.red.toFixed(3),
    rgba.green.toFixed(3),
    rgba.blue.toFixed(3),
    rgba.alpha.toFixed(3),
  ].join(",");
}
