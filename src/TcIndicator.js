import GObject from "gi://GObject";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Pango from "gi://Pango";
import Clutter from "gi://Clutter";
import Graphene from "gi://Graphene";
import St from "gi://St";
import Meta from "gi://Meta";
import Shell from "gi://Shell";

import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { gettext as _ } from "resource:///org/gnome/shell/extensions/extension.js";

import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import * as Util from "resource:///org/gnome/shell/misc/util.js";
import { notify } from "resource:///org/gnome/shell/ui/main.js";

import * as Languages from "./languages.js";
import { GoogleTranslator } from "./google.js";
import { Fields } from "./config/constants.js";

const IndicatorName = "Translate Clipboard";

export const TcIndicator = GObject.registerClass(
  {
    Signals: {
      tccompleted: { param_types: [GObject.TYPE_STRING] },
      error: { param_types: [GObject.TYPE_STRING] },
    },
  },
  class TcIndicator extends GObject.Object {
    _init(ext) {
      super._init();
      this._extension = ext;
      this._settings = this._extension.getSettings();
      this._trans_cmd = ext.path + "/trans";

      this._oldtext = null;
      this._showOriginalPhonetics = true;
      this._autoClose = this._settings.get_boolean(Fields.AUTO_CLOSE);
      this._engine = this._settings.get_string(Fields.ENGINE);
      this._dump = true;
      this._proxy = this._settings.get_string(Fields.PROXY);
      this._briefMode = this._settings.get_boolean(Fields.BRIEF_MODE);
      this._detectingLanguage = false;
      this._pendingText = null;

      this._locale = this._getLocale();

      this._settingsChangedId = this._settings.connect("changed", () => {
        this._settingsChanged();
      });

      this._settingsChanged();
      // this._watchClipboard();
    }

    destroy() {
      this._removeKeybindings();
      this._selection.disconnect(this._ownerChangedId);
      this._settings.disconnect(this._settingsChangedId);
    }

    _openPrefs() {
      this._extension.openPreferences();
    }

    _settingsChanged() {
      this._oldtext = null;
      this._briefMode = this._settings.get_boolean(Fields.BRIEF_MODE);
      this._autoClose = this._settings.get_boolean(Fields.AUTO_CLOSE);
      this._proxy = this._settings.get_string(Fields.PROXY);
      this._engine = this._settings.get_string(Fields.ENGINE);

      let from = this._settings.get_string(Fields.FROM);
      let to = this._settings.get_string(Fields.TO);
      let toPrimary = this._settings.get_string(Fields.TO_PRIMARY);
      let toSecondary = this._settings.get_string(Fields.TO_SECONDARY);

      let isoLangs = Languages.isoLangs;

      if (from == "") from = "auto";
      else from = this._getCode(from);

      if (to == "" || to.toLowerCase() == "auto")
        to = this._getCode(this.locale);
      else to = this._getCode(to);

      if (toPrimary == "" || toPrimary.toLowerCase() == "auto")
        toPrimary = this._getCode(this.locale);
      else toPrimary = this._getCode(toPrimary);

      if (toSecondary == "" || toSecondary.toLowerCase() == "auto")
        toSecondary = "";
      else toSecondary = this._getCode(toSecondary);

      this._toPrimary = toPrimary;
      this._toSecondary = toSecondary;

      // Update the language selector value display
      if (this._fromSelector && this._fromSelector.valueLabel) {
        this._updateLanguageSelectorValue(this._fromSelector.valueLabel, from);
      }
      if (this._toPrimarySelector && this._toPrimarySelector.valueLabel) {
        this._updateLanguageSelectorValue(
          this._toPrimarySelector.valueLabel,
          toPrimary,
        );
      }
      if (this._toSecondarySelector && this._toSecondarySelector.valueLabel) {
        this._updateLanguageSelectorValue(
          this._toSecondarySelector.valueLabel,
          toSecondary,
        );
      }

      if (this._translator && this._translateCompleted) {
        this._translator.disconnect(this._translateCompleted);
        this._translateCompleted = null;
      }

      this._translator = new GoogleTranslator();
      this._translateCompleted = this._translator.connect(
        "completed",
        this._onCompleted.bind(this),
      );
      this._translator.connect("error", (object, error) => {
        notify(IndicatorName, error);
      });
    }

    _watchClipboard() {
      this._selection = global.display.get_selection();
      this._clipboard = St.Clipboard.get_default();
      this._ownerChangedId = this._selection.connect("owner-changed", () => {
        if (this._enabled) {
          let [x, y, mods] = global.get_pointer();
          let buttonMask =
            Clutter.ModifierType.BUTTON1_MASK |
            Clutter.ModifierType.BUTTON2_MASK |
            Clutter.ModifierType.BUTTON3_MASK |
            Clutter.ModifierType.SHIFT_MASK |
            Clutter.ModifierType.CONTROL_MASK |
            Clutter.ModifierType.SUPER_MASK;
          if (buttonMask & mods) return;
          this._clipboardChanged();
        }
      });
    }

    _clipboardChanged() {
      [this._x, this._y] = global.get_pointer();
      this._clipboard.get_text(St.ClipboardType.PRIMARY, (clipboard, text) => {
        if (
          text &&
          text != "" &&
          text[0] != "/" &&
          //RegExp(/\S+/).exec(text) &&
          !Util.findUrls(text).length &&
          !RegExp(/^[\.\s\d\-]+$/).exec(text)
        ) {
          this._oldtext = text;
          if (this._translateWindow) {
            this._translateWindow.showLoading(this._x, this._y, text);
          }
          this._translate(text);
        } else {
          if (this._translateWindow && this._translateWindow._actor) {
            this._translateWindow._close();
          }
        }
      });
    }

    _onCompleted(emitter, result) {
      // If detecting language, extract the detected language from the result
      if (this._detectingLanguage) {
        try {
          let json = JSON.parse(result);
          let detectedLang = json[2]; // Google Translate API returns the detected language code

          // Select the appropriate target language
          let targetLang = this._selectTargetLanguage(detectedLang);

          if (targetLang === null) {
            let [x, y] = [this._x, this._y];
            let originalText = this._pendingText;
            this._detectingLanguage = false;
            this._pendingText = null;
            this.emit(
              "tccompleted",
              JSON.stringify([
                [[originalText, originalText, null, null, 0]],
                null,
                detectedLang,
              ]),
            );
            return;
          }

          this._detectingLanguage = false;
          let text = this._pendingText;
          this._pendingText = null;
          this._translator.translate(
            detectedLang,
            targetLang,
            this._proxy,
            text,
          );
          return;
        } catch (error) {
          log("Failed to parse detection result: " + error);
          this._detectingLanguage = false;
          this._pendingText = null;
        }
      }
      this.emit("tccompleted", result);
      return;
    }

    _selectTargetLanguage(detectedLang) {
      // Normalize the detected language code (remove the region suffix, e.g. zh-CN -> zh)
      let detectedBase = detectedLang.split("-")[0];

      if (this._toPrimary && this._toPrimary !== "") {
        let primaryBase = this._toPrimary.split("-")[0];
        if (detectedBase === primaryBase || detectedLang === this._toPrimary) {
          if (this._toSecondary && this._toSecondary !== "") {
            let secondaryBase = this._toSecondary.split("-")[0];
            if (
              detectedBase === secondaryBase ||
              detectedLang === this._toSecondary
            ) {
              return null;
            }
            return this._toSecondary;
          }
          return null;
        }
        return this._toPrimary;
      }

      // If there is no primary target language, check the secondary target language
      if (this._toSecondary && this._toSecondary !== "") {
        let secondaryBase = this._toSecondary.split("-")[0];
        if (
          detectedBase === secondaryBase ||
          detectedLang === this._toSecondary
        ) {
          return null;
        }
        return this._toSecondary;
      }

      // If there is no target language, use the default to
      let defaultTo = this._settings.get_string(Fields.TO);
      if (defaultTo && defaultTo !== "auto" && defaultTo !== "") {
        let toBase = defaultTo.split("-")[0];
        if (detectedBase === toBase || detectedLang === defaultTo) {
          return null;
        }
        return defaultTo;
      }

      return null;
    }

    _getLocale() {
      this.locale = GLib.get_language_names()[0];

      if (this.locale == "C") this.locale = "en";
      this.locale = this.locale.replace("_", "-");
    }

    _getCode(lang) {
      let isoLangs = Languages.isoLangs;
      lang = lang.replace("_", "-");
      let code = isoLangs[lang];
      if (code == undefined) {
        let codes = [lang, lang.split("-")[0]];
        for (let [i, c] of codes.entries()) {
          let l = Object.keys(isoLangs).find(
            (key) =>
              key.indexOf(c) != -1 ||
              isoLangs[key].name.indexOf(c) != -1 ||
              isoLangs[key].nativeName.indexOf(c) != -1,
          );
          if (l != undefined) return l;
        }
        return "en";
      } else {
        return lang;
      }
    }

    _isRtl(code) {
      var rtlCodes = ["ar", "he", "ps", "fa", "sd", "ur", "yi", "ug"];
      return rtlCodes.indexOf(code) != -1;
    }

    _updateLanguageSelectorValue(valueLabel, value) {
      if (!valueLabel) return;

      let displayValue = "";
      if (value === "" || value === null) {
        displayValue = _("None");
      } else if (value === "auto") {
        displayValue = _("Auto");
      } else {
        let isoLangs = Languages.isoLangs;
        let lang = isoLangs[value];
        if (lang) {
          displayValue = lang.name;
        } else {
          displayValue = value;
        }
      }

      valueLabel.text = displayValue;
    }

    _translate(text) {
      let from = this._settings.get_string(Fields.FROM) || "auto";

      if (from === "auto" && this._toPrimary && this._toPrimary !== "") {
        log(`Translating from auto to primary: ${this._toPrimary}`);
        this._detectingLanguage = true;
        this._pendingText = text;
        this._translator.translate("auto", this._toPrimary, this._proxy, text);
      } else if (
        from === "auto" &&
        this._toSecondary &&
        this._toSecondary !== ""
      ) {
        log(`Translating from auto to secondary: ${this._toSecondary}`);
        this._detectingLanguage = true;
        this._pendingText = text;
        this._translator.translate(
          "auto",
          this._toSecondary,
          this._proxy,
          text,
        );
      } else {
        if (this._toPrimary && this._toPrimary !== "") {
          let targetLang = this._selectTargetLanguage(from);
          if (targetLang === null) {
            if (this._translateWindow) {
              let [x, y] = [this._x, this._y];
              let originalText = text;
              this._translateWindow.showResult(
                JSON.stringify([
                  [[originalText, originalText, null, null, 0]],
                  null,
                  from,
                ]),
                x,
                y,
              );
            }
            return;
          }
          this._translator.translate(from, targetLang, this._proxy, text);
        } else {
          let targetLang =
            this._toPrimary ||
            this._settings.get_string(Fields.TO) ||
            this._locale;
          this._translator.translate(from, targetLang, this._proxy, text);
        }
      }
    }
  },
);
