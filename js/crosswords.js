/**
Copyright (c) 2025, Crossword Nexus & Crossweird LLC
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
**/

/* ==============================================================================
reminder cell structure:

{
  "x": 1,          COLONNE
  "y": 1,          LIGNE
  "solution": "H", SOLUTION (vraie lettre correcte)
  "letter": "H",   CURRENT LETTER (maybe wrong)
  "type": null,    null si lettre, "block" si black square
  "number": "1",   clue number 
  "bar": { "top": false, "bottom": false, "left": false, "right": false },
  "color": null,
  "shape": null,
  "image": null,
  "fixed": false,     => DISCARDED, UNUSED (messes save /load)
  "shade_highlight_color": "#FEE300",
  "empty": false,     ??????
  "clue": false,      ???????
  "checked": false,   BARREE (wrong entry)
  "revealed": false   CHEATED
}
================================================================================
*/
// Settings that we can save
const CONFIGURABLE_SETTINGS = [
  "skip_filled_letters", "arrow_direction", "space_bar", "tab_key",
  "timer_autostart", "dark_mode_enabled", "gray_completed_clues",
  "confetti_enabled"
];

// Since DarkReader is an external library, make sure it exists
try {
  DarkReader
} catch {
  DarkReader = false;
}

// one-time check for mobile device status
const IS_MOBILE = CrosswordShared.isMobileDevice();


// Helper function for PWA setup
function setupPWAInstallButton(btn) {
  if (!btn) {
    console.warn("Install button not found.");
    return; // Safe early exit
  }

  let deferredPrompt = null;  // <-- persist between handlers

  // Listen only if button exists
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;  // <-- now correctly stored

    btn.show();

    btn.off('click').on('click', async () => {
      if (!deferredPrompt) return; // extra safety

      deferredPrompt.prompt();
      await deferredPrompt.userChoice;

      btn.hide();
      deferredPrompt = null;  // prevents reuse
    });
  });

  window.addEventListener('appinstalled', () => {
    btn.hide();
  });
}



// Main crossword javascript for the Crossword Nexus HTML5 Solver
(function(global, factory) {
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory(global);
  } else {
    factory(global, true);
  }
})(
  typeof window !== 'undefined' ? window : this,
  function(window, registerGlobal) {
    'use strict';

    var default_config = {
      color_hover: '#FFFFAA',
      color_selected: '#FF4136',
      color_word: '#FEE300',
      color_hilite: '#F8E473',
      color_word_shade: '#BAAB56',
      color_none: '#FFFFFF',
      background_color_clue: '#666666',
      default_background_color: '#c2ed7e',
      color_secondary: '#fff7b7',
      font_color_clue: '#FFFFFF',
      font_color_fill: '#000000',
      color_block: '#212121',
      puzzle_file: null,
      puzzle_object: null, // jsxw to load, if available
      puzzles: null,
      skip_filled_letters: true,
      arrow_direction: 'arrow_move_filled',
      space_bar: 'space_clear',
      filled_clue_color: '#999999',
      timer_autostart: true,
      confetti_enabled: true,
      dark_mode_enabled: false,
      tab_key: 'tab_skip',
      bar_linewidth: 3.2,
      gray_completed_clues: false,
      forced_theme: null,
      lock_theme: false,
      autocheck: true,
      displayCheatMarks: false,
      autosave: false,
      display_cn: false,
      min_sidebar_clue_width: 220
    };

    // constants
    var FILE_JPZ = 'jpz';
    var FILE_PUZ = 'puz';
    var MIN_SIZE = 10;
    var MAX_SIZE = 100;
    var SKIP_UP = 'up';
    var SKIP_DOWN = 'down';
    var SKIP_LEFT = 'left';
    var SKIP_RIGHT = 'right';
    var STORAGE_KEY = 'crossword_nexus_savegame';
    var SETTINGS_STORAGE_KEY = 'crossword_nexus_settings';

    /*const PUZZLE_STORAGE_VERSION = 'v3';  // bump this anytime you change the structure*/

    // messages
    var MSG_SAVED = 'Crossword saved';
    var MSG_LOADED = 'Crossword loaded';

    var MAX_CLUES_LENGTH = 2;

    var TYPE_UNDEFINED = typeof undefined;
    var XMLDOM_ELEMENT = 1;
    var XMLDOM_TEXT = 3;
    var ZIPJS_CONFIG_OPTION = 'zipjs_path';
    var ZIPJS_PATH = 'lib/zip';

    // errors
    var ERR_FILE_LOAD = 'Error loading file';
    var ERR_PARSE_JPZ = 'Error parsing JPZ file... Not JPZ or zipped JPZ file.';
    var ERR_NOT_CROSSWORD = 'Error opening file. Probably not a crossword.';
    var ERR_NO_JQUERY = 'jQuery not found';
    var ERR_CLUES_GROUPS = 'Wrong number of clues in jpz file';
    var ERR_NO_PUZJS = 'Puz js not found';
    var ERR_LOAD = 'Error loading savegame - probably corrupted';
    var ERR_NO_SAVEGAME = 'No saved game found';

    var load_error = false;

    var CROSSWORD_TYPES = ['crossword', 'coded', 'acrostic'];
    const FILE_ACCEPT_EXTENSIONS = '.puz,.xml,.jpz,.xpz,.ipuz,.cfp';
    const IS_IPAD_SAFARI_OR_FIREFOX = (function() {
      if (typeof navigator === 'undefined') {
        return false;
      }
      const ua = navigator.userAgent || '';
      const platform = navigator.platform || '';
      const isIpad =
        ua.includes('iPad') ||
        (platform === 'MacIntel' && navigator.maxTouchPoints && navigator.maxTouchPoints > 1);
      if (!isIpad) {
        return false;
      }
      const isSafari =
        /\bSafari\b/i.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
      const isFirefox = /FxiOS|Firefox/i.test(ua);
      return isSafari || isFirefox;
    })();
    var xw_timer, xw_timer_seconds = 0;
    var v_display_cn = default_config.display_cn;


    /** Template will have to change along with CSS **/
    var template = `
      <div class = "cw-main auto normal">
        <!-- Overlay for opening puzzles -->
        <div class = "cw-open-holder">
        <div class="cw-overflow"></div>
          <div class="cw-open-puzzle">
            <div class="cw-open-puzzle-instructions">
              Drag and drop a file here, or click the button to choose a file
              to open.
            </div>
            <button type = "button" class = "cw-button cw-button-open-puzzle">
              Open puzzle file
            </button>
            <div class = "cw-open-puzzle-formats">
              <b>Accepted formats: </b> PUZ, JPZ, XML, CFP, and iPUZ (partial)
            </div>
            <button id="installAppBtn" style="display: none; margin-top: 1.5rem;">
              📥 Install this app for offline solving
            </button>
          </div>
          <input type = "file" class = "cw-open-jpz">

        </div>
        <!-- End overlay -->
        <header class = "cw-header"></header>
        <div class = "cw-content">
          <!-- Placeholder for modal boxes -->
          <div    class = "cw-modal"></div>
          <div    class = "cw-grid">
          <div    class = "cw-buttons-holder">
          <label class = "cw-autocheck-label" backend-required>
            <input type = "checkbox" class="cw-autosave-checkbox" id="autosave1" >
            Autosave
          </label>
          <label class = "cw-autocheck-label">
            <input type = "checkbox" class="cw-autocheck-checkbox" id="autocheck1" checked>
            Autocheck
          </label>
          <div    class = "cw-menu-container">
          <button type  = "button" class = "cw-button">
            <span class="cw-button-icon">🧩</span>
                   Crossword
                  <span class = "cw-arrow"></span>
                </button>
                <div    class = "cw-menu">
                <button class = "cw-menu-item cw-save-db" backend-required>Save to DB</button>
                <button class = "cw-menu-item cw-load-db" backend-required>Load from DB</button>
                <button class = "cw-menu-item cw-file-info">Info</button>
                <button class = "cw-menu-item cw-file-notepad">Notes</button>
                <button class = "cw-menu-item cw-file-load">Open ...</button>
                <button class = "cw-menu-item cw-file-print">Print</button>
                <button class = "cw-menu-item cw-file-save">Save as iPuz</button>
                <button class = "cw-menu-item cw-file-clear">Restart</button>
                </div>
              </div>
              <div    class = "cw-menu-container cw-check">
              <button type  = "button" class = "cw-button">
                <span class="cw-button-icon">🔍</span>
                   Check
                  <span class = "cw-arrow"></span>
                </button>
                <div    class = "cw-menu">
                <button class = "cw-menu-item cw-check-letter">Letter</button>
                <button class = "cw-menu-item cw-check-word">Word</button>
                <button class = "cw-menu-item cw-check-puzzle">Puzzle</button>
                </div>
              </div>
              <div    class = "cw-menu-container cw-reveal">
              <button type  = "button" class = "cw-button">
                <span class="cw-button-icon">💡</span>
                   Reveal
                  <span class = "cw-arrow"></span>
                </button>
                <div    class = "cw-menu">
                <button class = "cw-menu-item cw-reveal-letter">Letter</button>
                <button class = "cw-menu-item cw-reveal-word">Word</button>
                <button class = "cw-menu-item cw-reveal-puzzle">Puzzle</button>
                </div>
              </div>

              <button type = "button" class = "cw-button cw-settings-button">
                <span class="cw-button-icon">⚙️</span>
                 Settings
              </button>
              <span   class = "cw-flex-spacer"></span>
              <button type  = "button" class = "cw-button cw-button-timer">00:00</button>
            </div>
            <input type  = "text" class = "cw-hidden-input">
            <div   class = "cw-canvas">
              <div   class = "cw-puzzle-container">
                <div   class = "cw-top-text-wrapper">
                  <div   class = "cw-top-text">
                    <span  class = "cw-clue-text-up"></span>
                  </div>
                </div>
              </div>
              <div id = "cw-zoom-container" >
                <svg id = "cw-puzzle-grid"></svg>
              </div>
            </div>
          </div>
          <div class = "cw-clues-holder"></div>
        </div>
      </div>`;

    // Returns a jQuery Deferred object that resolves to a Uint8Array
    function loadFileFromServer(path, type) {
      const deferred = $.Deferred();
      const xhr = new XMLHttpRequest();

      xhr.open('GET', path);
      xhr.responseType = 'arraybuffer'; // binary-safe for .puz, .jpz, etc.

      xhr.onload = function() {
        if (xhr.status === 200) {
          const data = new Uint8Array(xhr.response);
          deferred.resolve(data);
        } else {
          deferred.reject(ERR_FILE_LOAD);
        }
      };

      xhr.onerror = function() {
        deferred.reject(ERR_FILE_LOAD);
      };

      xhr.send();
      return deferred;
    }

    // Check if we can drag and drop files
    var isAdvancedUpload = (function() {
      var div = document.createElement('div');
      return (
        ('draggable' in div || ('ondragstart' in div && 'ondrop' in div)) &&
        'FormData' in window &&
        'FileReader' in window
      );
    })();

    function loadFromFile(file, type, deferred) {
      const reader = new FileReader();
      deferred = deferred || $.Deferred();

      reader.onload = function(event) {
        const data = new Uint8Array(event.target.result);
        deferred.resolve(data);
      };

      reader.readAsArrayBuffer(file);
      return deferred;
    }

    // Breakpoint config for the top clue, as tuples of `[max_width, max_font_size]`
    const maxClueSizes = [
      [1080, 19], // If width ≤1080px, max font is 19px ...
      [1200, 22],
      [Infinity, 23],
    ];

    /** Function to resize text **/
    function resizeText(rootElement, nodeList) {
      const minSize = 7;
      const rootWidth = rootElement.width();
      const maxSize = maxClueSizes.find(bp => bp[0] > rootWidth)?.[1] ?? 24;
      const unit = 'px';

      if (nodeList[0].scrollHeight == 0) return; // do nothing in listView mode
      for (var j = 0; j < nodeList.length; j++) {
        const el = nodeList[j];
        const parent = el.parentNode;
        let low = minSize;
        let high = maxSize;
        let best = minSize;

        // binary search for largest size that fits
        while (low <= high) {
          const mid = Math.ceil((low + high) / 2);
          el.style.fontSize = `${mid}${unit}`;

          const overflow = el.scrollHeight > parent.clientHeight ||
            el.scrollWidth > parent.clientWidth;

          if (overflow) {
            high = mid - 1;
          } else {
            best = mid;
            low = mid + 1;
          }
        }
        el.style.fontSize = `${best}${unit}`;
      }
    }


    // Breakpoint widths used by the stylesheet.
    const breakpoints = [420, 600, 850, 1080, 1200];

    function setBreakpointClasses(rootElement) {
      const rootWidth = rootElement.width();

      for (const breakpoint of breakpoints) {
        const className = `cw-max-width-${breakpoint}`;

        if (rootWidth <= breakpoint) {
          rootElement.addClass(className);
        } else {
          rootElement.removeClass(className);
        }
      }
    }

    // Function to check if a cell is solved correctly
    function isCorrect(entry, solution) {
      // if we have a rebus or non-alpha solution or no solution, accept anything
      if (entry && (!solution || solution.length > 1 || /[^A-Za-z]/.test(solution))) {
        return true;
      }
      // otherwise, only mark as okay if we have an exact match
      else {
        return entry == solution;
      }
    }

    /**
     * Sanitize HTML in the given string, except the simplest no-attribute
     * formatting tags.
     */
    const entityMap = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
      '/': '&#x2F;',
      '`': '&#x60;',
      '=': '&#x3D;',
    };
    const escapeRegex = new RegExp(
      `</?(i|b|em|strong|span|br|p)>|[&<>"'\`=\\/]`,
      'g'
    );

    function escape(string) {
      //return String(string).replace(escapeRegex, (s) =>
      //  s.length > 1 ? s : entityMap[s]
      //);
      return string;
    }

    var CrosswordNexus = {
      createCrossword: function(parent, user_config) {
        var crossword;
        try {
          if (typeof jQuery === TYPE_UNDEFINED) {
            throw new Error(ERR_NO_JQUERY);
          }
          crossword = new CrossWord(parent, user_config);
        } catch (e) {
          alert(e.message);
          console.log(e);
        }
        return crossword;
      },
    };

    class CrossWord {
      constructor(parent, user_config) {
        this.parent = parent;
        this.config = {};
        // Load solver config — settings are applied asynchronously via
        // _loadSettingsAsync() once localforage resolves.
        var i;
        var configurable_settings_set = new Set(CONFIGURABLE_SETTINGS);
        for (i in default_config) {
          if (default_config.hasOwnProperty(i)) {
            // user_config takes priority over defaults; localforage settings
            // are applied afterward in _loadSettingsAsync().
            if (user_config && user_config.hasOwnProperty(i)) {
              this.config[i] = user_config[i];
            } else {
              this.config[i] = default_config[i];
            }
          }
        }
        this.v_autocheck = default_config.autocheck;
        this.v_displayCheatMarks = default_config.displayCheatMarks;
        this.v_autosave = default_config.autosave;
        this.is_saving = false;
        //this.backendEnabled = false;
        this.backendPromise = null;
        // Apply persisted settings asynchronously from localforage
        this._loadSettingsAsync(user_config);
        this.currentScale = 1.0;
        this.translatedClues = null;

        /*
        This code dynamically generates a matching color theme based on a single base color (COLOR_WORD). It uses HSV (Hue, Saturation, Value) transformations to ensure all UI elements (hover states, highlights, buttons) look visually consistent.
        Logic: Instead of hardcoding colors like "blue" or "red," it uses Color.applyHsvTransform. This takes your base color and tweaks:
            dh (Delta Hue): Shifts the actual color (e.g., making it slightly more purple or green).
            ks (Saturation Factor): Adjusts how "vibrant" or "gray" the color is.
            kv (Value Factor): Adjusts the brightness.
        */

        /* Update config values based on `color_word` */
        const COLOR_WORD = this.config.color_word;
        const COLOR_SELECTED = this.config.color_selected;
        // color for hovered cell (if enabled)
        this.config.color_hover = Color.applyHsvTransform(COLOR_WORD, {
          dh: 6.38,
          ks: 0.333,
          kv: 1.004
        });
        // color for corresponding cells (in acrostics and codewords)
        this.config.color_hilite = Color.applyHsvTransform(COLOR_WORD, {
          dh: -2.64,
          ks: 0.536,
          kv: 0.976
        });
        // color for cross-referenced cells (currently unused)
        this.config.color_secondary = Color.applyHsvTransform(COLOR_WORD, {
          dh: -0.29,
          ks: 0.282,
          kv: 1.004
        });

        /* Update CSS values based on `color_word` and `color_selected`*/
        this.updateCSS = (word, selected) => {
          const root = document.documentElement;
          const isDark = document.body.classList.contains('dark-mode');
          
          // If dark mode is on, darken the colors a bit (reduce Value by 15%)
          let wordColor = word;
          let selectedColor = selected;
          
          if (isDark) {
            wordColor = Color.applyHsvTransform(word, { kv: 0.85 });
            selectedColor = Color.applyHsvTransform(selected, { kv: 0.85 });
          }

          root.style.setProperty("--grid-selected-square-color", selectedColor);
          root.style.setProperty("--grid-selected-word-color", wordColor);
          root.style.setProperty("--grid-hilite-color", Color.applyHsvTransform(wordColor, { dh: -2.64, ks: 0.536, kv: 0.976 }));

          // For grid lines inside selected areas in dark mode
          if (isDark) {
            root.style.setProperty("--grid-selected-stroke-color", "rgba(0,0,0,0.2)");
          } else {
            root.style.setProperty("--grid-selected-stroke-color", "var(--grid-stroke-color)");
          }

          // Helper for setting dynamic contrast text
          const setContrastText = (varName, bgColor) => {
            const brightness = Color.getBrightness(bgColor);
            root.style.setProperty(varName, brightness < 128 ? "#ffffff" : "#000000");
          };

          // Buttons
          const buttonBgColor = Color.applyHsvTransform(wordColor, { dh: 0.13, ks: 0.753, kv: 1.004 });
          root.style.setProperty("--button-bg-color", buttonBgColor);
          setContrastText("--button-text-color", buttonBgColor);

          const buttonHoverColor = Color.applyHsvTransform(wordColor, { dh: 0.28, ks: 0.502, kv: 1.004 });
          root.style.setProperty("--button-hover-color", buttonHoverColor);
          setContrastText("--button-hover-text-color", buttonHoverColor);

          // Note & Timer Buttons
          const noteBgColor = isDark ? "#333333" : "#EEEEEE";
          const noteHoverBgColor = isDark ? "#444444" : "#999999";
          root.style.setProperty("--button-note-timer-bg-color", noteBgColor);
          root.style.setProperty("--button-note-timer-hover-bg-color", noteHoverBgColor);
          root.style.setProperty("--button-note-timer-border", isDark ? "#555555" : "#888888");
          setContrastText("--button-note-timer-text-color", noteBgColor);
          setContrastText("--button-note-timer-hover-text-color", noteHoverBgColor);

          // Active Timer State
          const runBg = "#90ee90"; // Always green
          const pauseBg = "#ffc107"; // Always amber
          root.style.setProperty("--timer-running-bgcolor", runBg);
          root.style.setProperty("--timer-paused-bgcolor", pauseBg);
          setContrastText("--timer-running-text-color", runBg);
          setContrastText("--timer-paused-text-color", pauseBg);

          // Clues
          let clueActiveColor = Color.applyHsvTransform(wordColor, { dh: 0.13, ks: 0.753, kv: 1.004 });
          if (isDark) {
            clueActiveColor = Color.averageColors(clueActiveColor, '#808080', 0.75); // 75% original, 25% gray
          }
          root.style.setProperty("--clue-active-color", clueActiveColor);
          setContrastText("--clue-active-text-color", clueActiveColor);

          // Passive clues (same as grid highlight usually)
          const cluePassiveColor = Color.applyHsvTransform(wordColor, { dh: -2.64, ks: 0.536, kv: 0.976 });
          root.style.setProperty("--clue-passive-color", cluePassiveColor);
          setContrastText("--clue-passive-text-color", cluePassiveColor);

          const topTextBgColor = Color.applyHsvTransform(wordColor, { dh: -8.62, ks: 0.157, kv: 1.004 });
          root.style.setProperty("--top-text-wrapper-bg-color", topTextBgColor);
          setContrastText("--top-text-wrapper-text-color", topTextBgColor);

          // Scrollbars
          root.style.setProperty("--clue-scrollbar-color-thumb", Color.averageColors(selectedColor, '#333333', 0.5));
        };

        this.updateCSS(COLOR_WORD, COLOR_SELECTED);

        /** enable dark mode if requested **/
        if (this.config.dark_mode_enabled) {
          document.body.classList.add('dark-mode');
          this.updateCSS(COLOR_WORD, COLOR_SELECTED);
        }

        this.cell_size = 40;
        //this.top_text_height = 0;
        //this.bottom_text_height = 0;
        this.grid_width = 0;
        this.grid_height = 0;
        this.cells = {};
        this.words = {};

        this.clueGroups = []; // array of clue groups
        this.displayClueGroups = null; // for "fakeclues" puzzles
        this.activeClueGroupIndex = 0;
        this.activeWord = null;

        this.selected_word = null;
        this.selected_cell = null;
        this.settings_open = false;
        // TIMER
        this.timer_running = false;

        this.diagramless_dir = 'across';

        // whether to show the reveal button
        this.has_reveal = true;

        this.handleClickWindow = this.handleClickWindow.bind(this);
        this.windowResized = this.windowResized.bind(this);

        this.init();
      } // END OF Constructor

      make_fake_clues(puzzle, clue_mapping = {}) {

        let across_group = new CluesGroup(this, {
          id: "clues_0",
          title: 'Across',
          clues: [],
          words_ids: [],
        });

        let down_group = new CluesGroup(this, {
          id: "clues_1",
          title: 'Down',
          clues: [],
          words_ids: [],
        });

        const clueMapping = {};

        var clueGroups;

        if (!this.realwords) {
          const entry_mapping = puzzle.get_entry_mapping();
          const thisGrid = JSCrossword.xwGrid(puzzle.cells);
          const acrossSet = new Set(
            Object.values(thisGrid.acrossEntries()).map(entry => entry.word)
          );

          Object.keys(entry_mapping).forEach((id) => {
            const entry = entry_mapping[id];
            const clue = {
              word: id,
              number: id,
              text: '--'
            };
            clueMapping[id] = clue;
            if (acrossSet.has(entry)) {
              across_group.clues.push(clue);
              across_group.words_ids.push(id);
            } else {
              down_group.clues.push(clue);
              down_group.words_ids.push(id);
            }
          });
          clueGroups = [across_group, down_group];
        } else {
          clueGroups = this.clueGroups;
        }

        return {
          clueGroups: clueGroups,
          clue_mapping: clueMapping
        };
      }

      init() {
        var parsePUZZLE_callback = this.parsePuzzle.bind(this);
        var error_callback = this.error.bind(this);

        // --- MODS, BASE64 & BZIP2 LOGIC ---
        const params = new URLSearchParams(window.location.search);

        if (this.root) {
          this.remove();
        }

        // build structures
        this.root = $(template);
        const fileInput = this.root.find('input.cw-open-jpz');
        if (IS_IPAD_SAFARI_OR_FIREFOX) {
          fileInput.removeAttr('accept');
        } else {
          fileInput.attr('accept', FILE_ACCEPT_EXTENSIONS);
        }
        this.top_text = this.root.find('div.cw-top-text');
        //this.bottom_text = this.root.find('div.cw-bottom-text');
        this.clues_holder = this.root.find('div.cw-clues-holder');

        this.toptext = this.root.find('.cw-top-text-wrapper');
        this.notes = new Map();

        this.settings_btn = this.root.find('.cw-settings-button');

        this.hidden_input = this.root.find('input.cw-hidden-input');
        this.reveal_letter = this.root.find('.cw-reveal-letter');
        this.reveal_word = this.root.find('.cw-reveal-word');
        this.reveal_puzzle = this.root.find('.cw-reveal-puzzle');

        this.check_letter = this.root.find('.cw-check-letter');
        this.check_word = this.root.find('.cw-check-word');
        this.check_puzzle = this.root.find('.cw-check-puzzle');

        this.info_btn = this.root.find('.cw-file-info');
        this.load_btn = this.root.find('.cw-file-load');
        // hide the load button by default
        this.load_btn.hide();

        this.print_btn = this.root.find('.cw-file-print');
        this.clear_btn = this.root.find('.cw-file-clear');
        this.save_btn = this.root.find('.cw-file-save');
        this.save_db_btn = this.root.find('.cw-save-db');
        this.load_db_btn = this.root.find('.cw-load-db');
        this.download_btn = this.root.find('.cw-file-download');
        this.autocheck_btn = this.root.find('.cw-autocheck-checkbox');
        this.autocheck2 = this.root.find('#autocheck2');
        this.autosave_btn = this.root.find('#autosave1');
        this.autosave_btn2 = this.root.find('#autosave2');

        // Notepad button is hidden by default
        this.notepad_btn = this.root.find('.cw-file-notepad');
        this.notepad_btn.hide();

        this.timer_button = this.root.find('.cw-button-timer');
        this.xw_timer_seconds = 0;

        // function to process uploaded files
        function processFiles(files) {
          loadFromFile(files[0], FILE_PUZ).then(
            function(data) {
              parsePUZZLE_callback(data);
            },
            function(err) {
              error_callback(err);
            }
          );
        }

        // used for localStorage:
        this.volname = params.get('voltitle')?.trim() ?? "";
        // used for text display:      
        const volt = params.get('voltitle')?.trim();
        this.voltitle = volt ? `${escape(volt)}&nbsp;•&nbsp;` : '';
        const fname = params.get('fname')?.trim();
        this.filename = fname ? fname : '';
        // used for translation
        const md5grid = params.get('md5grid')?.trim();
        this.md5grid = md5grid ? md5grid : null;
        const puzlang = params.get('lang')?.trim();
        this.puzlang = puzlang ? puzlang : 'fr';
        // preload one puzzle
        const b64Data = params.get('data');
        if (b64Data) {
            try {
                this.root.addClass('loading');
                const binaryString = atob(decodeURIComponent(b64Data));
                let bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }

                // Check for bzip2 header "BZh" (0x42 0x5a 0x68)
                if (bytes[0] === 0x42 && bytes[1] === 0x5a && bytes[2] === 0x68) {
                    try {               
                        bytes = bz2.decompress(bytes);
                    }catch (e) {
                     console.error("bzip2 library error",e);
                    }
                }
                Promise.resolve(bytes)
                .then(parsePUZZLE_callback)
                .catch(error_callback);
            } catch (e) {
                console.error("Data load failed:", e);
            }
        } else if (
          this.config.puzzle_file &&
          this.config.puzzle_file.hasOwnProperty('url') &&
          this.config.puzzle_file.hasOwnProperty('type')
        ) {
          this.root.addClass('loading');
          var loaded_callback = parsePUZZLE_callback;
          loadFileFromServer(
            this.config.puzzle_file.url,
            this.config.puzzle_file.type
          ).then(loaded_callback, error_callback);
        } else if (this.config.puzzle_object) {
          // Case 2: load from serialized (LZ) puzzle
          console.log("[startup] Loading puzzle from lzpuz param");
          const xw = this.config.puzzle_object;
          Promise.resolve(xw).then(parsePUZZLE_callback, error_callback);
        } else {
          // shows open button
          var i, puzzle_file, el;

          this.open_button = this.root.find('.cw-button-open-puzzle');
          this.file_input = this.root.find('input[type="file"]');

          // show the load button
          this.load_btn.show();

          this.open_button.on('click', () => {
            this.file_input.click();
          });

          this.file_input.on('change', () => {
            var files = this.file_input[0].files.length ?
              this.file_input[0].files :
              null;
            if (files) {
              processFiles(files);
            }
          });

          // Show PWA install button
          const btn = this.root.find('#installAppBtn');
          setupPWAInstallButton(btn);

          // drag-and-drop
          if (isAdvancedUpload) {
            const div_open_holder = this.root.find('div.cw-open-holder');
            const div_overflow = this.root.find('div.cw-overflow');
            div_overflow.addClass('has-advanced-upload');

            var droppedFiles = false;

            div_open_holder
              .on(
                'drag dragstart dragend dragover dragenter dragleave drop',
                function(e) {
                  e.preventDefault();
                  e.stopPropagation();
                }
              )
              .on('dragover dragenter', function() {
                div_overflow.addClass('is-dragover');
              })
              .on('dragleave dragend drop', function() {
                div_overflow.removeClass('is-dragover');
              })
              .on('drop', (e) => {
                const droppedFiles = e.originalEvent.dataTransfer.files;
                processFiles(droppedFiles);
              });
          }
        }

        // mapping of number to cells
        this.number_to_cells = {};
        // the crossword type
        this.crossword_type = 'crossword';
        // whether the puzzle is autofill
        this.is_autofill = false;

        this.root.appendTo(this.parent);
        this.canvas_holder = this.root.find('div.cw-canvas');
        this.zoom_container = this.root.find('#cw-zoom-container');
        // SVG setup (new)
        this.svgNS = 'http://www.w3.org/2000/svg';
        this.svgContainer = document.createElementNS(this.svgNS, 'svg');
        this.svgContainer.setAttribute('id', 'cw-puzzle-grid');
        // Preserve existing top text wrapper while replacing only the canvas
        this.zoom_container.find('#cw-puzzle-grid').remove(); // Remove old canvas only

        this.zoom_container.append(this.svgContainer); // Add new SVG crossword
        this.svg = $('#cw-puzzle-grid');

        setBreakpointClasses(this.root);
        // Place this at the END of the init() method:
        const svg = document.getElementById('cw-puzzle-grid');
        //this.initBackend();
        this.backendPromise = this.initBackend();
      } // ========> END INIT

      error(message) {
        alert(message);
      }

/**
 * BACKEND INTEGRATION & FAILSAFE ARCHITECTURE: code must provide saveDB and loadDb , which are from a backend, and override local storage (default strategy)
 * * STRATEGY: "Local-First" with Dynamic Opt-in.
 * 1. UI: Elements with [data-requires-backend] are hidden by default via CSS (!important). this keep html clean from unusable button and menu elts
 * 2. DETECTION: initBackend() probes for '/cgi-lmpuz/conf_back.cgi'.
 * 3. ACTIVATION: If found, .backend-active is added to body to reveal UI via CSS, it also provides urls to save / load on sqlite3 the puzzle states
 * 4. FALLBACK: If 404.. (ex: github pages etc..) or error, app remains in Static Mode with no errors, the game saves to browser localstorage.
 */
      async initBackend() {
        try {
          const response = await fetch('/cgi-lmpuz/conf_back.cgi', { referrerPolicy: 'no-referrer'});
          if (response.ok) {
            // Backend confirmed: reveal elements
            document.body.classList.add('backend-active');
            console.info("Backend features enabled.");
            const data = await response.json();
            this.back_saveDB = data['back_saveDB'];
            this.back_loadDB = data['back_loadDB'];
            this.v_autosave = true;
            $('#autosave1').prop('checked', this.v_autosave);
            $('#autosave2').prop('checked', this.v_autosave);
            document.querySelectorAll('.sync-emoji').forEach(el => { el.style.display = this.v_autosave ? '' : 'none'; });
            document.querySelectorAll('.signal-emoji').forEach(el => { el.title = "Backend present"; });
            //this.backendEnabled = true;
            return true;
          }
        } catch (e) {
        // Silent fail: elements remain hidden
        }
      console.info("Static mode: Backend features disabled.");
      return false;
    }

      normalizeClueTitle(rawTitle) {
        if (!rawTitle) return '';
        const title = rawTitle.trim().toUpperCase();

        if (title === 'ACROSS') return 'Across';
        if (title === 'DOWN') return 'Down';

        return rawTitle; // Preserve original if it's custom
      }

//---------------------------------------------------------------------------------------------------
      /**
       * Parse puzzle data into Crossword structure.
       *
       * - Accepts either a JSCrossword object or raw string data.
       * - Normalizes coordinates (shift +1 to be 1-indexed).
       * - Detects puzzle type (crossword, acrostic, coded).
       * - Initializes cells, words, and clues (real or fake).
       * - Enables autofill for acrostic/coded puzzles.
       */
      async parsePuzzle(data) {
        // if it's already a JSCrossword, return it as-is
        //console.log("INFO in parsePuzzle");
        var puzzle;
        if (data instanceof JSCrossword) {
          puzzle = data;
        } else {
          // otherwise, parse it directly -- JSCrossword handles the format detection
          puzzle = JSCrossword.fromData(new Uint8Array(data), {
            lockedHandling: "mask"
          });
        }

        puzzle.kind = puzzle.metadata.kind;

        this.jsxw = puzzle;

        // Expose ipuz string
        window.ipuz = this.jsxw.toIpuzString();

        this.diagramless_mode = false;

        // 1. Trust metadata if available
        if (puzzle.metadata && puzzle.metadata.crossword_type) {
          if (puzzle.metadata.crossword_type.toLowerCase() === 'diagramless') {
            this.diagramless_mode = true;
            console.log('Diagramless detected: from metadata.crossword_type');
          }
        }

        // 3. If diagramless, wipe all types BEFORE building cells
        if (this.diagramless_mode) {
          for (let i = 0; i < puzzle.cells.length; i++) {
            const cell = puzzle.cells[i];
            cell['top-bar'] = false;
            cell['bottom-bar'] = false;
            cell['left-bar'] = false;
            cell['right-bar'] = false;

            // Detect blocks manually
            const sol = cell.solution?.trim().toUpperCase();
            if (!sol || sol === '#' || sol === '.' || sol === '-') {
              cell.solution = '#'; // treat it as a block
            }

            if (cell.solution === '#') {
              cell.type = 'block';
              cell.letter = '';
            } else {
              cell.type = null;
              cell.letter = '';
            }
            cell.number = null;
          }
        }

        // Savegame
        const simpleHash = t => {
          let e = 0;
          for (let r = 0; r < t.length; r++) {
            e = (e << 5) - e + t.charCodeAt(r), e &= e
          }
          return new Uint32Array([e])[0].toString(36)
        };
        const myHash = simpleHash(JSON.stringify(puzzle));
        this.savegame_name = STORAGE_KEY + '_' + myHash;

        const versionKey = this.savegame_name + '_version';
        // (version check disabled - see commented block below)
        /*
        const savedVersion = await localforage.getItem(versionKey);
        if (savedVersion !== PUZZLE_STORAGE_VERSION) {
          console.log('[Crossword] Savegame version mismatch. Clearing old localforage.');
          await localforage.removeItem(this.savegame_name);
          await localforage.removeItem(this.savegame_name + "_notes");
          await localforage.setItem(versionKey, PUZZLE_STORAGE_VERSION);
        }
        */

        this.stat_errors = {};
        this.stat_cheated = {};
        const jsxw2_cells = await this.loadGame();
        if (jsxw2_cells) {
          console.log('Loading puzzle from localforage');
          var noteObj = await localforage.getItem(this.savegame_name + "_notes");
          if (noteObj && noteObj.length > 0) {
            for (var entry of noteObj) {
              this.notes.set(entry.key, entry.value);
            }
          }
          var statObj = await localforage.getItem(this.savegame_name + "_misc");
          if (statObj && Object.keys(statObj).length > 0) {
              this.stat_cheated = statObj.stat_cheated;
              this.stat_errors = statObj.stat_errors;
              this.v_autocheck = statObj.autocheck ?? true;
              this.v_autocheck = !this.v_autocheck ; this.toggleAutoCheck(); // fix checkboxes
              xw_timer_seconds = statObj.timeplayed;
          }
          puzzle.cells = jsxw2_cells;
        }

        const loadedFromStorage = Boolean(jsxw2_cells);

        puzzle.cells.forEach(c => {
          if (!c.top_right_number && c['top_right_number']) {
            c.top_right_number = c['top_right_number']; // Ensure key is present consistently
          }
        });

        // Metadata
        this.title = puzzle.metadata.title || '';
        this.author = puzzle.metadata.author || '';
        this.copyright = puzzle.metadata.copyright || '';
        this.crossword_type = puzzle.metadata.crossword_type;
        this.fakeclues = puzzle.metadata.fakeclues || false;
        //this.notepad = puzzle.metadata.description || ''; = notes
        this.notepad = ''; // no button needed
        this.puznotes = puzzle.metadata.description || ''; //= puz.notes, for info modal
        this.grid_width = puzzle.metadata.width;
        this.grid_height = puzzle.metadata.height;
        this.completion_message = puzzle.metadata.completion_message || "Puzzle solved!";

        if (this.title) {
          document.title = 'Nexus : ' + this.title ;
        }
        /*
        if (this.crossword_type == 'acrostic' || this.crossword_type == 'coded') {
          this.is_autofill = true;
        }
        */

        if (this.fakeclues || this.crossword_type === 'diagramless' || this.crossword_type === 'coded') {
          // top-text is meaningless for fakeclues and diagramless puzzles (and coded!)
          $('div.cw-top-text-wrapper').css({
            display: 'none'
          });

          // No need to leave room for the top-text
          $('#cw-puzzle-grid').css('margin-top', '3px');
        }

        // disable check and reveal in certain cases
        if (puzzle.metadata.has_reveal === false) {
          this.has_reveal = false;
          $('.cw-reveal').css({
            display: 'none'
          });
        }
        if (puzzle.metadata.has_check === false) {
          this.has_check = false;
          $('.cw-check').css({
            display: 'none'
          });
        }

        // === Build cells ===
        this.cells = {};
        this.number_to_cells = {};

        for (var i = 0; i < puzzle.cells.length; i++) {
          const rawCell = puzzle.cells[i];
          const c = {
            x: rawCell.x + 1,
            y: rawCell.y + 1,
            solution: rawCell.solution,
            letter: rawCell.letter || '',
            type: rawCell.type || null,
            number: rawCell.number || null,
            bar: {
              top: rawCell['top-bar'] === true,
              bottom: rawCell['bottom-bar'] === true,
              left: rawCell['left-bar'] === true,
              right: rawCell['right-bar'] === true,
            },
            color: rawCell['background-color'] || null,
            shape: rawCell['background-shape'] || null,
            image: rawCell['image'] || null,
            top_right_number: rawCell.top_right_number,
            fixed: false // ensure always false
          };

          /* set a "shade_highlight" color */
          if (c.color && c.color != this.config.color_none) {
            c.shade_highlight_color = Color.averageColors(this.config.color_word, Color.adjustColor(c.color, -50));
          } else {
            c.shade_highlight_color = this.config.color_word;
          }

          /* set the background color for "clue" cells */
          if (rawCell.clue) {
            c.color = this.config.background_color_clue;
          }

          // ✔ DO NOT reset `c.fixed` to false here!

          // Apply rules only if this is a fresh load
          // J : we dont use this stuff
          /*
          if (!loadedFromStorage && !c.fixed) {
            // Rule 1: Fix punctuation like ‘–’, ‘,’ etc
            if (c.letter && !/[A-Za-z]/.test(c.letter)) {
              c.fixed = true;
            }

            // Rule 2: Fix cells that only have top_right_number (A-Z clue label)
            if (
              /^[A-Z]$/.test(c.letter) &&
              c.top_right_number &&
              c.top_right_number === c.letter
            ) {
              c.fixed = true;
            }

            // Rule 3: Clue label cell in quote rows
            if (
              /^[A-Z]$/.test(c.letter) &&
              !c.top_right_number &&
              c.solution === c.letter
            ) {
              c.fixed = true;
            }
          }
          */

          if (this.diagramless_mode) {
            c.type = null;
            c.empty = false;
            c.clue = false;
            c.color = null;
            c.letter = '';
            c.number = null;
          } else {
            c.empty = (c.type === 'block' || c.type === 'void' || c.type === 'clue');
            c.clue = (c.type === 'clue');
          }

          if (!this.cells[c.x]) {
            this.cells[c.x] = {};
          }
          this.cells[c.x][c.y] = c;

          const key = c.number || c.top_right_number;
          if (key) {
            if (!this.number_to_cells[key]) {
              this.number_to_cells[key] = [];
            }
            this.number_to_cells[key].push(c);
          }
        }

        // If diagramless, renumber
        if (this.diagramless_mode) {
          this.renumberGrid();
        }

        // === Build clues ===
        let clueMapping = {};

        if (this.crossword_type === 'coded') {
          var fake_clue_obj = this.make_fake_clues(puzzle);
          this.clueGroups = fake_clue_obj.clueGroups;
          clueMapping = fake_clue_obj.clue_mapping;

          $('div.cw-clues-holder').css({
            display: 'none'
          });
          $('div.cw-top-text-wrapper').css({
            display: 'none'
          });
          $('div.cw-buttons-holder').css({
            padding: '0 10px'
          });

        } else {
          // Initialize clue mapping and groups dynamically
          this.clueGroups = [];

          /* fix 3 things:
          ! or ? followed by dots at $
          incorrect number of dots at end of clue (essentially cosmetic)
          incorrect hyphenation : "import- antes"
          */
          const fixClues = (str00) => {
           const str = str00.replace(/(\p{L}+)-\s+(\p{L}+)/gu, '$1$2').replace(/([!?])\.+$/, '$1');
           return str.replace(/\s*\.+$/, (match) => {
             // Trim spaces to get just the dots for counting
             const dotsOnly = match.trim();
             const count = dotsOnly.length;
             if (count === 1 || count === 3) {
               return dotsOnly; // Returns "." or "..." without the leading space
             }
             return ".";
            });
          };

          // Defensive: if no clues array exists
          const clueSets = puzzle.clues || [];

          // clean text clues: overwrite only text parts:
           /* puzzle.clues obj structure example:
           [ {
              "title": "ACROSS",
              "clue": [
                { "word": "1", "number": "1", "text": "Personnel d'entretien.." },
                { "word": "71", "number": "60", "text": "Demande une certaine attention ..." },...
              ]
            {
              "title": "DOWN",..
           ]   
          */    
          const clueSetsCleaned = clueSets.map(group => ({
               ...group, // Copy title, etc.
               clue: group.clue.map(item => ({
               ...item, // Copy word, number, etc.
               text: fixClues(item.text) // fix wrong dots at $
               }))
          }));

          // Create one CluesGroup per clue set
          clueSetsCleaned.forEach((clueSet, index) => {
            // Normalize title and word IDs
            const title = this.normalizeClueTitle(clueSet.title || `Clue Set ${index + 1}`);
            const clues = clueSet.clue || [];

            // Populate global mapping for quick lookup
            clues.forEach(clue => {
              if (clue.word) clueMapping[clue.word] = clue;
            });

            const words_ids = clues.map(c => c.word);

            // Create and store CluesGroup instance
            const group = new CluesGroup(this, {
              id: `clues_${index}`,
              title,
              clues,
              words_ids,
            });

            this.clueGroups.push(group);
          });

        }

        // Handle fake clues override
        var num_words = puzzle.words.length;
        var num_clues = puzzle.clues.map(x => x.clue).flat().length;
        if (this.fakeclues && num_words != num_clues) {
          // make a copy of the clue groups for display
          this.displayClueGroups = [...this.clueGroups];
          var fake_clue_obj = this.make_fake_clues(puzzle);
          this.clueGroups = fake_clue_obj.clueGroups;
          clueMapping = fake_clue_obj.clue_mapping;
        }

        // Update DOM with clue info
        const holder = document.querySelector('.cw-clues-holder');
        if (!holder) return;

        holder.innerHTML = ''; // clear old ones

        (this.displayClueGroups || this.clueGroups).forEach(group => {
          const div = document.createElement('div');
          div.classList.add('cw-clues');
          div.dataset.groupId = group.id;

          div.innerHTML = `
            <div class="cw-clues-title">${group.title}</div>
            <div class="cw-clues-items"></div>
          `;

          holder.appendChild(div);

          // Optionally attach scroll or resize logic
          //group.bindElement(div.querySelector('.cw-clues-items'));
        });

        // === Build words ===
        this.words = {};
        for (var i = 0; i < puzzle.words.length; i++) {
          const word = puzzle.words[i];
          this.words[word.id] = new Word(this, {
            id: word.id,
            dir: word.dir,
            refs_raw: null,
            cell_ranges: word.cells.map(function(c) {
              return {
                x: (c[0] + 1).toString(),
                y: (c[1] + 1).toString()
              };
            }),
            clue: clueMapping[word.id]
          });
        }

        //console.log(this);

        this.nonBlackCells=this.getNonBlackCells();

        this.completeLoad(); // will try to loadDb
        this.updateStatsUI()
        //if (this.v_autocheck) { this.check_reveal( 'puzzle', 'check'); this.renderCells() ; }
      } // END parsePuzzle
// -----------------------------------------------------------------------------------------------------------------------
      // Return the next non-block, in-bounds cell from a start cell in a given direction.
      // dir: 'across' (x+) or 'down' (y+). step = +1 (forward) or -1 (backward)
      nextDiagramlessCell(fromCell, dir = this.diagramless_dir, step = 1) {
        if (!fromCell) return null;
        let {
          x,
          y
        } = fromCell;

        if (dir === 'across') {
          for (let nx = x + step; nx >= 1 && nx <= this.grid_width; nx += step) {
            const c = this.getCell(nx, y);
            if (c && c.type !== 'block') return c;
          }
        } else {
          for (let ny = y + step; ny >= 1 && ny <= this.grid_height; ny += step) {
            const c = this.getCell(x, ny);
            if (c && c.type !== 'block') return c;
          }
        }
        return null;
      }

      setDiagramlessDir(dir) {
        if (dir !== this.diagramless_dir) {
          this.diagramless_dir = dir;
          this.adjustChevron();
        }
      }

      toggleDiagramlessDir() {
        this.setDiagramlessDir((this.diagramless_dir === 'across') ? 'down' : 'across');
      }
// -----------------------------------------------------------------------------------------------------------------------
      completeLoad() {
        // Force the header to wrap its content
    $('.cw-header').css('flex-wrap', 'wrap');

    $('.cw-header').html(`
        <span class="cw-title">${this.voltitle}${escape(this.title)}</span>
        <span class="cw-header-separator">&nbsp;•&nbsp;</span>
        <span class="cw-author">${escape(this.author)}</span>
        ${
          this.notepad
            ? `<button class="cw-button cw-button-notepad">
                 <span class="cw-button-icon">📝</span> Notes
               </button>` 
            : ''
        }
        <span class="cw-header-separator">&nbsp;•&nbsp;</span>
        <span class="autocheck-emoji" title="Autocheck On" >🅰️</span>
        <span class="signal-emoji" title="No Backend" >📶</span>
        <span class="sync-emoji" title="Autosync on">&#8597;&#65039;</span>
        <span class="cw-flex-spacer"></span>
        <span class="cw-copyright">${escape(this.copyright)}</span>
        
        <div style="flex-basis: 100%; height: 0;"></div>
        
        <span class="cw-author" id="misc-stats">Cheated:0 Errors:0</span>
        <span id="this-word-letters"></span>
    `);

       
        this.notepad_icon = this.root.find('.cw-button-notepad');

        // === Initial cell selection (diagramless or fakeclues) ===
        if (this.diagramless_mode || this.fakeclues) {
          const firstCell = this.getCell(1, 1);
          if (firstCell) {
            this.selected_cell = firstCell;
            this.selected_word = null;
            this.top_text.html(''); // Clear top clue text
            const initMessage = (this.diagramless_mode ? '[Diagramless Init]' : '[Fakeclues Init]');
            console.log(initMessage, {
              selected_cell: this.selected_cell,
              selected_word: this.selected_word,
              top_text: this.top_text.html()
            });
          }
        }

        //this.changeActiveClues();
        (this.displayClueGroups || this.clueGroups || []).forEach(group => {
          // Find the container that matches this group’s ID
          const container = document.querySelector(`.cw-clues[data-group-id="${group.id}"] .cw-clues-items`);
          if (container) {
            const displayGroup = group; // preserve old logic
            this.renderClues(displayGroup, container);
          }
        });
        this.addListeners();

        this.root.removeClass('loading');
        this.root.addClass('loaded');

        this.waitUntilSVGWidthStabilizes(() => {
          if (this.selected_word && this.top_text?.length) {
            resizeText(this.root, this.top_text);
          }
        });
        this.renderCells();
        this.styleClues();

        // === Post-render selection fallback ===
        if (this.diagramless_mode) {
          const firstCell = this.getCell(1, 1);
          if (firstCell) {
            this.selected_cell = firstCell;
            this.selected_word = null;
            this.top_text.html('');
          }
        } else {
          const first_word = this.clueGroups[this.activeClueGroupIndex].getFirstWord?.();
          if (first_word) {
            this.setActiveWord(first_word);
            const firstCell = first_word.getFirstCell?.();
            if (firstCell) {
              this.setActiveCell(firstCell);
            }
          }
        }

        const menu = document.querySelector('.cw-check');
        menu.style.display = this.v_autocheck ? 'none' : 'block';

        // update from DB
        this.loadDb();
        // Start the timer if necessary
        if (this.config.timer_autostart) {
          this.toggleTimer();
        }

        /** Some JS magic to deal with weird numbers of clue lists **/
        const holder = document.querySelector('.cw-clues-holder');
        if (!holder) return; // nothing to do if it doesn't exist

        const clues = holder.querySelectorAll('.cw-clues');
        if (!clues.length) return;

        const MIN_AVG_WIDTH = this.config.min_sidebar_clue_width; // tweak this breakpoint

        function updateClueLayout() {
          // available width per clue list
          const avgWidth = holder.offsetWidth / clues.length;
          const useColumn = avgWidth < MIN_AVG_WIDTH;

          // apply layout
          holder.style.flexDirection = useColumn ? 'column' : 'row';
          clues.forEach(clue => {
            clue.style.width = useColumn ? 'auto' : '';
          });

          // optional debug log
          // console.log(`→ avgWidth=${avgWidth.toFixed(1)}, layout=${useColumn ? 'column' : 'row'}`);
        }

        // run once on load
        updateClueLayout();

        // and whenever window resizes
        window.addEventListener("blur", () => {
         if (this.timer_running) {
             this.toggleTimer();
         }
        });
        window.addEventListener("focus", () => {
              if (!this.timer_running) {
                  this.toggleTimer(); 
              }
        });
        window.addEventListener('resize', updateClueLayout);
        document.addEventListener("visibilitychange", () => {
          if (document.hidden) {
              // If the timer is currently running, stop it
              if (this.timer_running) {
                this.toggleTimer();
              }
          } else {
             // Optional: Resume the timer when they come back
              if (!this.timer_running) {
                  this.toggleTimer(); 
              }
          }
        });

      } // end completeLoad
// -----------------------------------------------------------------------------------------------------------------------      

      remove() {
        this.removeListeners();
        this.root.remove();
      }

      removeGlobalListeners() {
        $(window).off('click', this.handleClickWindow);
        $(window).off('resize', this.windowResized);
      }

      removeListeners() {
        this.removeGlobalListeners();
        this.root.undelegate();
        this.clues_holder.undelegate('div.cw-clues-items span');
        this.svg.off('mousemove click');

        this.reveal_letter.off('click');
        this.reveal_word.off('click');
        this.reveal_puzzle.off('click');

        this.check_letter.off('click');
        this.check_word.off('click');
        this.check_puzzle.off('click');

        this.print_btn.off('click');
        this.clear_btn.off('click');
        this.load_btn.off('click');
        this.save_btn.off('click');
        this.save_db_btn.off('click');
        this.load_db_btn.off('click');
        this.download_btn.off('click');
        this.autocheck_btn.off('click');
        this.autocheck2.off('click');
        this.autosave_btn.off('click');
        this.autosave_btn2.off('click');
        this.timer_button.off('click');

        this.settings_btn.off('click');

        this.info_btn.off('click');
        this.notepad_btn.off('click');
        this.notepad_icon.off('click');

        this.hidden_input.off('input');
        this.hidden_input.off('keydown');
      }

      addListeners() {
        $(window).on('click', this.handleClickWindow);
        $(window).on('resize', this.windowResized);

        this.root.delegate(
          '.cw-menu-container > button',
          'click',
          this.handleClickOpenMenu.bind(this)
        );

        // Click to jump to clue, but DON'T if user just selected text (avoid nuking selection)
        this.clues_holder.delegate(
          'div.cw-clues-items div.cw-clue',
          'click',
          (e) => {
            const sel = window.getSelection && window.getSelection();
            if (sel && sel.toString().trim().length > 0) {
              // User highlighted text; ignore this click so selection stays.
              e.preventDefault();
              e.stopImmediatePropagation();
              return;
            }
            // No selection: proceed with the usual behavior
            this.clueClicked(e);
          }
        );

        // Right-click in the clue list → Ducktiles
        /*
        if (!IS_MOBILE) {
          this.clues_holder.delegate(
            'div.cw-clues-items div.cw-clue .cw-clue-text',
            'contextmenu',
            (e) => {
              e.preventDefault();
              const sel = window.getSelection && window.getSelection();
              const selectedText = (sel && sel.toString()) || '';
              this.openDucktilesOverlayWithClipboard(selectedText);
            }
          );
        }
        */

        this.svg.on('click', this.mouseClicked.bind(this));

        // REVEAL
        this.reveal_letter.on(
          'click',
          this.check_reveal.bind(this, 'letter', 'reveal')
        );
        this.reveal_word.on(
          'click',
          this.check_reveal.bind(this, 'word', 'reveal')
        );
        this.reveal_puzzle.on(
          'click',
          this.check_reveal.bind(this, 'puzzle', 'reveal')
        );

        // CHECK
        this.check_letter.on(
          'click',
          this.check_reveal.bind(this, 'letter', 'check')
        );
        this.check_word.on(
          'click',
          this.check_reveal.bind(this, 'word', 'check')
        );
        this.check_puzzle.on(
          'click',
          this.check_reveal.bind(this, 'puzzle', 'check')
        );

        // PRINTER
        this.print_btn.on('click', (e) => this.printPuzzle(e));

        // CLEAR
        this.clear_btn.on(
          'click',
          this.check_reveal.bind(this, 'puzzle', 'clear')
        );

        // SAVE
        this.save_btn.on('click', this.saveAsIpuz.bind(this));
        this.save_db_btn.on('click', (e) => { this.saveDb(e); });
        this.load_db_btn.on('click', (e) => { this.loadDb(e); });
        this.autocheck_btn.on('click', (e) => { this.toggleAutoCheck(e); });
        this.autosave_btn.on('click', (e) => { this.toggleAutoSave(e); });
        this.autosave_btn2.on('click', (e) => { this.toggleAutoSave(e); });

        // for eng Xword on mobile , display translation when clue is clicked:
        if (IS_MOBILE && this.puzlang !== 'fr') {
            this.top_text.on('click', async (event) => {
                // Find the span containing our data attributes
                const $span = $(event.currentTarget).find('.cw-clue-text-up');
                const clueNum = $span.data('number');
                const direction = $span.data('direction');

                if (clueNum && direction) {
                    // Fetch the translation
                    const translation = await this.getTranslation(clueNum, direction);
                    if (translation) {
                        // Update the text to the French version. use .text() to safely swap the content
                        $span.text(translation);
                        // visual feedback that it's translated (e.g., change color)
                        $span.css('color', '#002395');
                    }
                }
            });
        }

        // LOAD
        this.load_btn.on('click', () => {
          this.init();   // re-initialize
          this.file_input.click();
        });

        // TIMER
        //this.timer_button.on('click', this.toggleTimer.bind(this));
        this.timer_button.on('click', (e) => { this.toggleTimer(e); });

        // SETTINGS
        this.settings_btn.on('click', this.openSettings.bind(this));

        // INFO
        this.info_btn.on('click', this.showInfo.bind(this));

        // PREV/NEXT BUTTONS FOR MOBILE
        this.root.find('.cw-button-prev-clue').on('click', () => {
          this.moveToNextWord(true, this.config.tab_key === 'tab_skip');
          this.hidden_input.focus();
        });
        this.root.find('.cw-button-next-clue').on('click', () => {
          this.moveToNextWord(false, this.config.tab_key === 'tab_skip');
          this.hidden_input.focus();
        });

        // NOTEPAD
        if (this.notepad) {
          this.notepad_icon.on('click', this.showNotepad.bind(this));
          this.notepad_btn.show();
        } else {
          this.notepad_icon.hide();
        }

        // Automatically show intro on load if it exists
        if (this.jsxw.metadata.intro) {
          setTimeout(() => this.showNotepad(), 300);
        }

        this.notepad_btn.on('click', this.showNotepad.bind(this));

        $(document).on('keydown', this.keyPressed.bind(this));
        $(document).on('keyup', (e) => { 
          const isPrintableChar = e.key.length === 1 && /^[a-z]$/i.test(e.key); // check only if a real key was pressed
          if (isPrintableChar && this.v_autocheck) { this.check_reveal('letter', 'check'); }
        });  

        this.svgContainer.addEventListener('click', (e) => {
          if (e.target.tagName === 'rect') {
            const x = parseInt(e.target.getAttribute('data-x'));
            const y = parseInt(e.target.getAttribute('data-y'));
            const clickedCell = this.getCell(x, y);

            if (this.diagramless_mode) {
              // Toggle direction if double-click same cell
              if (
                clickedCell &&
                this.selected_cell &&
                this.selected_cell.x === x &&
                this.selected_cell.y === y
              ) {
                this.toggleDiagramlessDir();
              }
              return; // prevent the normal puzzle branch below
            }

            if (!clickedCell.empty) {
              const groups = this.clueGroups || [];
              const n = groups.length;
              if (!n) return;

              let newActiveWord = null;
              let newGroupIndex = this.activeClueGroupIndex;

              // Try current group first
              const currentGroup = groups[this.activeClueGroupIndex];
              newActiveWord = currentGroup.getMatchingWord(x, y, true);

              // If not found, cycle through remaining groups (2, 3, ..., N, 0, 1, ...)
              if (!newActiveWord) {
                for (let offset = 1; offset < n; offset++) {
                  const i = (this.activeClueGroupIndex + offset) % n;
                  const group = groups[i];
                  const match = group.getMatchingWord(x, y, true);
                  if (match) {
                    newActiveWord = match;
                    newGroupIndex = i;
                    break;
                  }
                }
              }

              if (newActiveWord != this.activeWord) {
              //if (newActiveWord) {
                this.activeWord = newActiveWord;
                this.activeClueGroupIndex = newGroupIndex;
                this.setActiveWord(newActiveWord);
                this.setActiveCell(clickedCell);
              } else {
                this.setActiveCell(clickedCell);
              }
            }
          }
        });

        this.svgContainer.addEventListener('dblclick', (e) => {
          if (e.target.tagName === 'rect') {
            const x = parseInt(e.target.getAttribute('data-x'));
            const y = parseInt(e.target.getAttribute('data-y'));
            const clickedCell = this.getCell(x, y);

            if (
              !clickedCell.empty &&
              this.selected_cell &&
              this.selected_cell.x === x &&
              this.selected_cell.y === y
            ) {
              this.changeActiveClues(); // toggle direction
            }
          }
        });

        // Right-click on the top clue bar → Ducktiles
        /*
        if (!IS_MOBILE) {
          this.top_text.on('contextmenu', (e) => {
            e.preventDefault();
            let selectedText = '';
            const sel = window.getSelection && window.getSelection();
            if (sel && sel.rangeCount > 0) selectedText = sel.toString();
            if (!selectedText.trim()) {
              const topClone = this.top_text.clone()[0];
              const onlyText = topClone.querySelector?.('.cw-clue-text');
              const source = onlyText || topClone;
              selectedText = (source.textContent || '').trim();
            }
            if (/[A-Za-z]/.test(selectedText)) {
              this.openDucktilesOverlayWithClipboard(selectedText);
            }
          });
        }
        */
      }

      handleClickWindow(event) {
        this.root.find('.cw-menu').removeClass('open');
      }

      handleClickOpenMenu(event) {
        const menuContainer = $(event.target).closest('.cw-menu-container');
        const menu = menuContainer.find('.cw-menu');
        const isAlreadyOpen = menu.hasClass('open');

        // Close all dropdowns first
        this.root.find('.cw-menu').removeClass('open');

        // If it wasn't already open, open this one
        if (!isAlreadyOpen) {
          setTimeout(() => {
            menu.addClass('open');
          });
        }
      }


      // Create a generic modal box with content
      createModalBox(title, content, button_text = 'Close') {
        // Set the contents of the modal box
        const modalContent = `
        <div class="modal-content">
          <div class="modal-header">
            <span class="modal-close">&times;</span>
            <span class="modal-title">${title}</span>
          </div>
          <div class="modal-body">
            ${content}
          </div>
          <div class="modal-footer">
            <button class="cw-button" id="modal-button">${button_text}</button>
          </div>
        </div>`;
        // Set this to be the contents of the container modal div
        this.root.find('.cw-modal').html(modalContent);

        // Show the div
        var modal = this.root.find('.cw-modal').get(0);
        modal.style.display = 'block';

        // Allow user to close the div
        const this_hidden_input = this.hidden_input;
        var span = this.root.find('.modal-close').get(0);
        // When the user clicks on <span> (x), close the modal
        span.onclick = function() {
          modal.style.display = 'none';
          if (!IS_MOBILE) {
            this_hidden_input.focus();
          }
        };
        // When the user clicks anywhere outside of the modal, close it
        window.onclick = function(event) {
          if (event.target == modal) {
            modal.style.display = 'none';
            if (!IS_MOBILE) {
              this_hidden_input.focus();
            }
          }
        };
        // Clicking the button should close the modal
        var modalButton = document.getElementById('modal-button');
        modalButton.onclick = function() {
          modal.style.display = 'none';
          if (!IS_MOBILE) {
            this_hidden_input.focus();
          }
        };
      }

      setConfig(name, value) {
        this.config[name] = value;
      }

      /**
       * Switch active clue group.
       * - If targetIndex is provided, jump there (always).
       * - Otherwise, cycle to the next group that contains the selected cell (if any).
       * - If none match, just stay on the next group.
       */
      changeActiveClues(targetIndex = null) {
        const groups = this.clueGroups || [];
        const n = groups.length;
        if (n <= 1) return;

        let curIndex = this.activeClueGroupIndex ?? 0;
        let newIndex = curIndex;

        if (targetIndex !== null && targetIndex >= 0 && targetIndex < n) {
          // Explicit jump — always allow
          newIndex = targetIndex;
        } else {
          // Cycle forward until we find a group that matches the selected cell
          for (let i = 1; i <= n; i++) {
            const idx = (curIndex + i) % n;
            if (!this.selected_cell) {
              newIndex = idx;
              break;
            }
            const g = groups[idx];
            if (g?.getMatchingWord(this.selected_cell.x, this.selected_cell.y, true)) {
              newIndex = idx;
              break;
            }
            // If we went through all and none matched, default to next anyway
            if (i === n) newIndex = (curIndex + 1) % n;
          }
        }

        // --- Apply the new index ---
        this.activeClueGroupIndex = newIndex;
        const activeGroup = groups[newIndex];

        // --- Update selected word if we have a cell ---
        if (this.selected_cell && activeGroup) {
          const {
            x,
            y
          } = this.selected_cell;
          const word = activeGroup.getMatchingWord(x, y, true);
          if (word) this.setActiveWord(word);
        }

        // --- Refresh sidebar highlighting (optional but recommended) ---
        this.refreshSidebarHighlighting?.();
      }

      getCell(x, y) {
        return this.cells[x] ? this.cells[x][y] : null;
      }

      // display current state of word as "W_O_R_D" in the relevant $#
      showCurrentWordStateAsString(word) {
          const wordString = word.cell_ranges.map(range => {
             const cell = this.cells[range.x][range.y];
             return (cell.letter && cell.letter !== "") ? cell.letter : "_"; 
             }).join("");
          //console.log(wordString); 
          // display in header space:
          $('#this-word-letters').text(wordString);
          $('#this-word-letters-mobile').text(wordString);
      }

      setActiveWord(word) {
        if (word) {
          this.showCurrentWordStateAsString(word);
          this.setSelectedWord(word);

          if (this.fakeclues) {
            return;
          }
          this.top_text.html(`
            <span class="cw-clue-text-up" data-number="${escape(word.clue.number)}" data-direction="${escape(this.getClueDirection(word))}">
              ${escape(word.clue.text)}
            </span>
          `);
          resizeText(this.root, this.top_text);
        }
      }

      // for word, get its direction . if x stays constant => Down, else Across
      getClueDirection(word) {
        // Ensure we have at least two cells to compare
        if (!word.cell_ranges || word.cell_ranges.length < 2) {
            return "Across"; // Default fallback
        }

        const firstCell = word.cell_ranges[0];
        const secondCell = word.cell_ranges[1];

        // If x is constant (the same) for the first two cells, it is a vertical word
        if (firstCell.x === secondCell.x) {
            return "Down";
        }
        return "Across";
      }

      setActiveCell(cell) {
        if (!cell || cell.empty) return;

        this.setSelectedCell(cell);

        // Mark active/inactive state for all clue groups
        const groups = this.clueGroups || [];

        groups.forEach(group => {
          // The first param (`isInactive`) is true for all groups except the active one
          const isInactive = group !== this.clueGroups[this.activeClueGroupIndex];
          if (typeof group.markActive === 'function') {
            group.markActive(cell.x, cell.y, isInactive, this.fakeclues);
          }
        });

        // --- Move and focus hidden input ---
        const offset = this.svg.offset();
        const input_top = offset.top + (cell.y - 1) * this.cell_size;
        const input_left = offset.left + (cell.x - 1) * this.cell_size;

        this.hidden_input.css({
          left: input_left,
          top: input_top,
        });

        if (!IS_MOBILE) {
          this.hidden_input.focus();
        }
     }

      renderClues(clues_group, clues_container) {
        const $container = $(clues_container);

        // Locate title and items within the container
        const $title = $container.find('div.cw-clues-title').length ?
          $container.find('div.cw-clues-title') :
          $container.closest('.cw-clues').find('div.cw-clues-title');

        const $items = $container.find('div.cw-clues-items').length ?
          $container.find('div.cw-clues-items') :
          $container;

        const notes = this.notes;
        $items.find('div.cw-clue').remove();

        // --- render each clue ---
        for (const clue of clues_group.clues) {
          const clue_el = $(`
            <div style="position: relative">
             <span class="cw-clue-number">${escape(clue.number)}</span>
            <span class="cw-clue-text">
                ${escape(clue.text)}
                <!-- Changed from input to a display box -->
                <div class="cw-translation-display translation-style" style="display: none;">
                <!-- Translation text will be injected here -->
                </div>
                <span class="cw-cluenote-button" style="display: none;"></span>
            </span>
            </div>
          `);

          // attach metadata
          clue_el.data({
            word: clue.word,
            number: clue.number,
            clues: clues_group.id,
          }).addClass(`cw-clue word-${clue.word}`);

          // restore any saved note
          /*
          const clueNote = notes.get(clue.word);
          if (clueNote !== undefined) {
            clue_el.find('.cw-input').val(clueNote);
            clue_el.find('.cw-edit-container').show();
          }
          */

          $items.append(clue_el);
        }

        // Set the group title
        if ($title.length) $title.text(escape(clues_group.title));
        clues_group.clues_container = $items;

        // --- event listeners ---
        const save = () => this.saveGame();

        $items
          .on('click', '.cw-clue', function() {
                const $el = $(this);
                $el.find('.cw-translation-display').hide();
          })
          // Use (event) => instead of function() unless "this" is lost
          .on('mouseenter', '.cw-clue', (event) => {
               //here this' refers to app object
               if (this.puzlang !== 'fr') {
                   const $el = $(event.currentTarget); // Use event.currentTarget for the element
                   $el.find('.cw-cluenote-button').show();
               }
           })
          .on('mouseleave', '.cw-clue', (event) => {
               if (this.puzlang !== 'fr') {
                   const $el = $(event.currentTarget); // Use event.currentTarget for the element
                    $el.find('.cw-cluenote-button').hide();
                }
          })
          .on('click', '.cw-cluenote-button', async (event) => {
            const $button = $(event.currentTarget);
            const $container = $button.closest('.cw-clue-text');
            const $displayBox = $container.find('.cw-translation-display');
            //const $button = $(this);

            // 1. Get the clue number
            const $clueRow = $button.closest('.cw-clue');
            const clueNum = $clueRow.find('.cw-clue-number').text().trim();

            // 2. Get the direction (Across or Down)
            // Traverse up to the main clues wrapper, then find the sibling title
            const direction = $clueRow.closest('.cw-clues')
                              .find('.cw-clues-title')
                              .text()
                              .trim(); // Returns "Across" or "Down"

            // 3. Use them in your updated function
            const translation = await this.getTranslation(clueNum, direction);
            //const displayBox = clueElement.querySelector('.cw-translation-display');
            
            if (translation) {
                $displayBox.text(translation).show();
                $button.hide();
            }

            // 4. Update the UI
            //const $container = $clueRow.find('.cw-edit-container');
            //$container.show().find('input').val(translation);
          })
          /*
          .on('blur', '.cw-input', function() {
            const $input = $(this);
            const $clue = $input.closest('.cw-clue');
            const wordId = $clue.data('word');
            const newText = $input.val().trim();

            setTimeout(() => {
              const newlyFocused = document.activeElement;
              if (newlyFocused?.classList.contains('cw-hidden-input')) return;

              if (newText.length > 0) {
                notes.set(wordId, newText);
              } else {
                $clue.find('.cw-edit-container').hide();
                notes.delete(wordId);
              }
              save();
            }, 10);
          })
          .on('keydown', '.cw-input', function(event) {
            if (event.key === 'Enter') $(this).blur();
          });
          */
      }


      // Clears canvas and re-renders all cells
      renderCells() {
        const svg = this.svgContainer;
        svg.innerHTML = ''; // Clear SVG grid before redrawing
        this.svgElements = {cells: {}};

        const fillGroup = this.svgElements.fillGroup = document.createElementNS(this.svgNS, 'g');
        const barGroup = this.svgElements.barGroup = document.createElementNS(this.svgNS, 'g');
        svg.appendChild(fillGroup);
        svg.appendChild(barGroup);

        /**
         * Loop through the cells and write to SVG
         * Note: for fill and bars: we do all the fill first, then all the bars
         * This is so later fill doesn't overwrite later bars
         **/
        for (let xStr in this.cells) {
          this.svgElements.cells[xStr] = {};
          for (let yStr in this.cells[xStr]) {
            this.svgElements.cells[xStr][yStr] = {};
            this.adjustCell(this.cells[xStr][yStr]);
          }
        }
        this.positionGrid();
      }

      positionGrid() {
        // Responsive SVG sizing
        const canvasRect = this.canvas_holder.get(0).getBoundingClientRect();
        const mtop = parseFloat(this.zoom_container.css('margin-top'));
        const maxHeight = canvasRect.height - parseInt(mtop, 10);
        const maxWidth = canvasRect.width;

        this.cell_size = Math.floor(
          Math.min(
            maxWidth / this.grid_width,
            maxHeight / this.grid_height
          )
        );

        const svgWidth = this.grid_width * this.cell_size;
        const svgHeight = this.grid_height * this.cell_size;

        this.svgContainer.setAttribute('viewBox', `0 0 ${svgWidth} ${svgHeight}`);
        this.svgContainer.setAttribute('width', svgWidth);
        this.svgContainer.setAttribute('height', svgHeight);
        this.zoom_container.css('width',  svgWidth  + 'px');
        this.zoom_container.css('height', svgHeight + 'px');

        if (this.toptext && this.toptext[0]) {
          if (! IS_MOBILE) { this.toptext[0].style.width = svgWidth + 'px';} else { this.toptext[0].style.width = '100%';}
        }

        const SIZE = this.cell_size;
        const padding= (IS_MOBILE ? 0 : 10);
        this.svgContainer.setAttribute(
          'viewBox',
          `-${padding} -${padding} ${this.grid_width * SIZE + padding * 2} ${this.grid_height * SIZE + padding * 2}`
        );

        for (const col of Object.values(this.cells)) {
          for (const cell of Object.values(col)) {
            this.adjustCellPosition(cell);
          }
        }
        this.adjustChevron();
        setTimeout(() => this.syncTopTextWidth(), 0);
      }

      adjustCell(cell) {
        if (!this.svgElements) {
          return;
        }
        const elements = this.svgElements.cells[cell.x][cell.y];
        const shouldRender = !cell.empty || cell.clue === true || cell.type === 'block' || cell.top_right_number;

        const showRect = shouldRender;
        if (showRect && !elements.rect) {
          const rect = elements.rect = document.createElementNS(this.svgNS, 'rect');
          rect.setAttribute('data-x', cell.x);
          rect.setAttribute('data-y', cell.y);
          rect.setAttribute('class', 'cw-cell');
          this.svgElements.fillGroup.appendChild(rect);
        } else if (!showRect && elements.rect) {
          elements.rect.parentNode.removeChild(elements.rect);
          delete elements.rect;
        }
        this.adjustCellRect(cell);

        const showImage = shouldRender && cell.image;
        if (showImage && !elements.image) {
          const imageLayer = elements.image = document.createElementNS(this.svgNS, 'image');
          imageLayer.setAttribute('preserveAspectRatio', 'xMidYMid slice');
          imageLayer.setAttribute('class', 'cw-cell-image');
          imageLayer.setAttribute('href', cell.image);
          imageLayer.setAttributeNS('http://www.w3.org/1999/xlink', 'href', cell.image);
          this.svgElements.fillGroup.appendChild(imageLayer);
        } else if (!showImage && elements.image) {
          elements.image.parentNode.removeChild(elements.image);
          delete elements.image;
        }

        const showCircle = shouldRender && cell.shape === 'circle';
        if (showCircle && !elements.circle) {
          const circle = elements.circle = document.createElementNS(this.svgNS, 'circle');
          circle.setAttribute('fill', 'none');
          circle.setAttribute('stroke', 'var(--grid-stroke-color)');
          circle.setAttribute('stroke-width', 1.1);
          circle.setAttribute('pointer-events', 'none');
          this.svgElements.fillGroup.appendChild(circle);
        } else if (!showCircle && elements.circle) {
          elements.circle.parentNode.removeChild(elements.circle);
          delete elements.circle;
        }

        for (const [side, show] of Object.entries(cell.bar ?? {})) {
          const showBar = shouldRender && show;
          const key = `bar-${side}`;
          if (showBar && !elements[key]) {
            const barLine = elements[key] = document.createElementNS(this.svgNS, 'line');
            barLine.setAttribute('stroke-width', this.config.bar_linewidth);
            barLine.setAttribute('stroke-linecap', 'square');
            barLine.setAttribute('pointer-events', 'none');
            this.svgElements.barGroup.appendChild(barLine);
          } else if (!showBar && elements[key]) {
            elements[key].parentNode.removeChild(elements[key]);
            delete elements[key];
          }
          this.adjustCellBar(cell, side);
        }

        const showLetter = shouldRender && cell.letter;
        if (showLetter && !elements.letter) {
          const text = elements.letter = document.createElementNS(this.svgNS, 'text');
          text.setAttribute('text-anchor', 'middle');
          text.setAttribute('font-family', 'Arial, sans-serif');
          text.classList.add('cw-cell-letter');
          this.svgContainer.appendChild(text);
        } else if (!showLetter && elements.letter) {
          elements.letter.parentNode.removeChild(elements.letter);
          delete elements.letter;
        }
        this.adjustCellLetter(cell);

        const showNumber = v_display_cn && shouldRender && cell.number;
        if (showNumber && !elements.number) {
          const number = elements.number = document.createElementNS(this.svgNS, 'text');
          number.setAttribute('font-family', 'Arial, sans-serif');
          number.classList.add('cw-cell-number');
          this.svgContainer.appendChild(number);
        } else if (!showNumber && elements.number) {
          elements.number.parentNode.removeChild(elements.number);
          delete elements.number;
        }
        this.adjustCellNumber(cell);
	      //
        // 1. Error Indicator: Top-Right Orange Triangle
        //if (elements.showcheats) {

        if (this.v_displayCheatMarks && this.v_autocheck && this.stat_errors[`${cell.x},${cell.y}`] ) {
            const size = this.cell_size;
            const cellX = (cell.x - 1) * size;
            const cellY = (cell.y - 1) * size;
            const triangle = document.createElementNS(this.svgNS, 'polygon');
            const p1 = `${cellX + size},${cellY}`;             // Top-right corner
            const p2 = `${cellX + size},${cellY + size * 0.2}`; // Down the right side
            const p3 = `${cellX + size * 0.8},${cellY}`;       // Left along the top
            triangle.setAttribute('points', `${p1} ${p2} ${p3}`);
            // can be RGB: '#FF4500':
            triangle.setAttribute('fill', 'orange');
            this.svgContainer.appendChild(triangle);
        }

        // 2. Cheated Indicator: Bottom-Right Red Triangle
        //if (elements.showcheats) {
        if (this.v_displayCheatMarks && this.v_autocheck && this.stat_cheated[`${cell.x},${cell.y}`]) {
            const size = this.cell_size;
            const cellX = (cell.x - 1) * size;
            const cellY = (cell.y - 1) * size;
            const triangle = document.createElementNS(this.svgNS, 'polygon');
            const p1 = `${cellX + size},${cellY + size}`;      // Bottom-right corner
            const p2 = `${cellX + size},${cellY + size * 0.8}`; // Up the right side
            const p3 = `${cellX + size * 0.8},${cellY + size}`; // Left along the bottom
            triangle.setAttribute('points', `${p1} ${p2} ${p3}`);
            triangle.setAttribute('fill', 'red');
            this.svgContainer.appendChild(triangle);
        }

        const showTopRightNumber = shouldRender && cell.top_right_number && cell.top_right_number !== cell.letter;
        if (showTopRightNumber && !elements.top_right_number) {
            const label = elements.top_right_number = document.createElementNS(this.svgNS, 'text');
            label.setAttribute('text-anchor', 'end');
            label.setAttribute('font-family', 'Arial, sans-serif');
            label.setAttribute('pointer-events', 'none');
            label.classList.add('cw-top-right-label');
            this.svgContainer.appendChild(label);
        } else if (!showTopRightNumber && elements.top_right_number) {
          elements.top_right_number.parentNode.removeChild(elements.top_right_number);
          delete elements.top_right_number;
        }
        this.adjustCellTopRightNumber(cell);

        const showSlash = shouldRender && cell.checked;
        if (showSlash && !elements.slash) {
          const slash = elements.slash = document.createElementNS(this.svgNS, 'line');
          slash.setAttribute('stroke-linecap', 'round');
          this.svgContainer.appendChild(slash);
        } else if (!showSlash && elements.slash) {
          elements.slash.parentNode.removeChild(elements.slash);
          delete elements.slash;
        }
        this.adjustCellSlash(cell);

        this.adjustCellPosition(cell);
      }

      adjustCellPosition(cell) {
        if (!this.svgElements) {
          return;
        }
        const elements = this.svgElements.cells[cell.x][cell.y];
        const size = this.cell_size;
        const cellX = (cell.x - 1) * size;
        const cellY = (cell.y - 1) * size;
        const barCoords = {
          top: [[cellX, cellY], [cellX + size, cellY]],
          left: [[cellX, cellY], [cellX, cellY + size]],
          right: [[cellX + size, cellY + size], [cellX + size, cellY]],
          bottom: [[cellX + size, cellY + size], [cellX, cellY + size]],
        };

        if (elements.rect) {
          elements.rect.setAttribute("x", cellX);
          elements.rect.setAttribute("y", cellY);
          elements.rect.setAttribute("width", size);
          elements.rect.setAttribute("height", size);
        }
        if (elements.circle) {
          elements.circle.setAttribute('cx', cellX + size / 2);
          elements.circle.setAttribute('cy', cellY + size / 2);
          // Slightly bigger than cell, so edges are clipped
          const inset = 0.3; // lower is bigger
          const radius = size / 2 + inset;
          elements.circle.setAttribute('r', radius);
        }
        if (elements.image) {
          elements.image.setAttribute('x', cellX);
          elements.image.setAttribute('y', cellY);
          elements.image.setAttribute('width', size);
          elements.image.setAttribute('height', size);
        }
        for (const side of Object.keys(cell.bar ?? {})) {
          const key = `bar-${side}`;
          if (elements[key]) {
            const [[x1, y1], [x2, y2]] = barCoords[side];
            elements[key].setAttribute('x1', x1);
            elements[key].setAttribute('y1', y1);
            elements[key].setAttribute('x2', x2);
            elements[key].setAttribute('y2', y2);
          }
        }
        if (elements.letter) {
          const letterLength = cell.letter.length;
          const maxScale = 0.6;
          const minScale = 0.25;
          const scale = Math.max(minScale, maxScale - 0.07 * (letterLength - 1));
          elements.letter.setAttribute('x', cellX + size / 2);
          elements.letter.setAttribute('y', cellY + size * 0.77);
          elements.letter.setAttribute('font-size', `${this.cell_size * scale}px`);
        }
	     

        if (v_display_cn && elements.number) {
          elements.number.setAttribute('x', cellX + size * 0.1);
          elements.number.setAttribute('y', cellY + size * 0.3);
          elements.number.setAttribute('font-size', `${size / 3.75}px`);
        }
        if (elements.top_right_number) {
          elements.top_right_number.setAttribute('x', cellX + size * 0.9);
          elements.top_right_number.setAttribute('y', cellY + size * 0.3);
          elements.top_right_number.setAttribute('font-size', `${size / 3.75}px`);
        }
        if (elements.slash) {
          elements.slash.setAttribute('x1', cellX + 2);
          elements.slash.setAttribute('y1', cellY + 2);
          elements.slash.setAttribute('x2', cellX + size - 2);
          elements.slash.setAttribute('y2', cellY + size - 2);
        }
      }

      adjustCellRect(cell) {
        const rect = this.svgElements.cells[cell.x][cell.y].rect;
        if (!rect) {
          return;
        }
        
        // Use block color for stroke if it's a block, otherwise normal stroke color
        let rectStroke = (cell.type === 'block') ? 'var(--grid-block-color)' : 'var(--grid-stroke-color)';
        
        // If it's selected or in the selected word, use the specialized stroke color
        if (cell.type !== 'block' && ((this.selected_cell && cell.x === this.selected_cell.x && cell.y === this.selected_cell.y) || (this.selected_word && this.selected_word.hasCell(cell.x, cell.y)))) {
          rectStroke = 'var(--grid-selected-stroke-color)';
        }

        const isSelected = !!(this.selected_cell && cell.x === this.selected_cell.x && cell.y === this.selected_cell.y);
        const isLinked = !!(this.selected_cell && this.number_to_cells[this.selected_cell.number || this.selected_cell.top_right_number]?.includes(cell));
        rect.classList.toggle('selected', isSelected);
        rect.classList.toggle('linked', isLinked); // optional CSS hook
        rect.setAttribute('fill', this.cellFillColor(cell));
        rect.setAttribute('stroke', rectStroke);
      }

      adjustCellBar(cell, side) {
        const barLine = this.svgElements.cells[cell.x][cell.y][`bar-${side}`];
        if (!barLine) {
          return;
        }

        let barColor = 'var(--grid-stroke-color)';

        if (cell.type !== 'block' && ((this.selected_cell && cell.x === this.selected_cell.x && cell.y === this.selected_cell.y) || (this.selected_word && this.selected_word.hasCell(cell.x, cell.y)))) {
          barColor = 'var(--grid-selected-stroke-color)';
        }
        barLine.setAttribute('stroke', barColor);
      }

      adjustCellLetter(cell) {
        const letter = this.svgElements.cells[cell.x][cell.y].letter;
        if (!letter) {
          return;
        }
        letter.textContent = cell.letter;
        letter.setAttribute('fill', this.cellFontColor(cell));
      }

      adjustCellNumber(cell) {
        const number = this.svgElements.cells[cell.x][cell.y].number;
        if (!number) {
          return;
        }

        number.textContent = cell.number;
        number.setAttribute('fill', this.cellFontColor(cell));
      }

      adjustCellTopRightNumber(cell) {
        const label = this.svgElements.cells[cell.x][cell.y].top_right_number;
        if (!label) {
          return;
        }
        
        label.setAttribute('fill', this.cellFontColor(cell));
        label.textContent = cell.top_right_number;
      }

      adjustCellSlash(cell) {
        const slash = this.svgElements.cells[cell.x][cell.y].slash;
        if (!slash) {
          return;
        }

        if (this.diagramless_mode) {
          const solutionIsBlock = (cell.solution === '#');
          const typeIsBlock = (cell.type === 'block');
          if (solutionIsBlock !== typeIsBlock) {
            slash.setAttribute('stroke', 'red');
            slash.setAttribute('stroke-width', 2.5);
          } else {
            slash.setAttribute('stroke', 'var(--grid-none-text-color)');
            slash.setAttribute('stroke-width', 2);
          }
        } else {
          slash.setAttribute('stroke', 'var(--grid-none-text-color)');
          slash.setAttribute('stroke-width', 2);
        }
      }

      adjustChevron() {
        if (!this.svgElements) {
          return;
        }
        // Tiny direction chevron for diagramless
        const showChevron = this.diagramless_mode && this.selected_cell;
        if (showChevron && !this.svgElements.chevron) {
          const path = this.svgElements.chevron = document.createElementNS(this.svgNS, 'path');
          path.setAttribute('fill', 'none');
          path.setAttribute('stroke', 'var(--grid-none-text-color)');
          path.setAttribute('stroke-width', 1.3);
          path.setAttribute('pointer-events', 'none');
          this.svgContainer.appendChild(path);
        } else if (!showChevron && this.svgElements.chevron) {
          this.svgElements.chevron.parentNode.removeChild(this.svgElements.chevron);
          delete this.svgElements.chevron;
        }
        if (this.svgElements.chevron) {
          // slightly smaller overall
          const size = this.cell_size;
          const cellX = (this.selected_cell.x - 1) * size;
          const cellY = (this.selected_cell.y - 1) * size;
          const pad = this.cell_size * 0.15; // smaller padding than before
          const cxAcross = cellX + size - pad;
          const cyAcross = cellY + pad * 1.1;

          const cxDown = cellX + size - pad;
          const cyDown = cellY + size - pad * 1.1;

          const d = (
            this.diagramless_dir === 'across'
            ? `M ${cxAcross - pad * 0.8} ${cyAcross - pad / 2}
              L ${cxAcross} ${cyAcross}
              L ${cxAcross - pad * 0.8} ${cyAcross + pad / 2}`
              // ► chevron (upper-right corner)
            : `M ${cxDown - pad / 2} ${cyDown - pad * 0.8}
              L ${cxDown} ${cyDown}
              L ${cxDown + pad / 2} ${cyDown - pad * 0.8}`
              // ▼ chevron (lower-right corner)
          );
          this.svgElements.chevron.setAttribute('d', d);
        }
      }

      cellFillColor(cell) {
        if (cell.type === 'block') {
          return cell.color || 'var(--grid-block-color)';
        } else if (this.selected_cell && cell.x === this.selected_cell.x && cell.y === this.selected_cell.y) {
          return 'var(--grid-selected-square-color)';
        } else if (this.selected_word && this.selected_word.hasCell(cell.x, cell.y)) {
          return cell.shade_highlight_color || 'var(--grid-selected-word-color)';
        } else if (this.selected_cell && this.number_to_cells[this.selected_cell.number || this.selected_cell.top_right_number]?.includes(cell)) {
          // highlight partners
          return cell.shade_highlight_color || 'var(--grid-selected-word-color)';
        } else if (cell.color) {
          return cell.color;
        } else {
          return 'var(--grid-none-color)';
        }
      }

      cellFontColor(cell) {
        const fillColor = this.cellFillColor(cell);
        if (cell.image) {
          // Images should show text in black regardless of background brightness
          return '#000000';
        } else if (typeof fillColor === 'string' && fillColor.startsWith('var(--grid-selected-square-color)')) {
          return 'var(--grid-selected-square-text-color)';
        } else if (typeof fillColor === 'string' && fillColor.startsWith('var(--grid-selected-word-color)')) {
          return 'var(--grid-selected-word-text-color)';
        } else if (typeof fillColor === 'string' && (fillColor.startsWith('var(--grid-none-color)') || fillColor.startsWith('var(--grid-block-color)'))) {
          return fillColor.includes('block') ? 'white' : 'var(--grid-none-text-color)';
        } else {
          // Brightness of the background and foreground
          const bgBrightness = Color.getBrightness(fillColor || this.config.color_none);
          const fgBrightness = Color.getBrightness(this.config.font_color_fill);

          // If we fail to meet some threshold, invert
          if (Math.abs(bgBrightness - fgBrightness) < 125) {
            var thisRGB = Color.hexToRgb(this.config.font_color_fill);
            var invertedRGB = thisRGB.map(x => 255 - x);
            return Color.rgbToHex(invertedRGB[0], invertedRGB[1], invertedRGB[2]);
          } else {
            return this.config.font_color_fill;
          }
        }
      }

      renumberGrid() {
        let number = 1;
        const width = this.grid_width;
        const height = this.grid_height;

        // Update the grid from the underlying jsxw object
        this.fillJsXw();
        console.log(this.jsxw);
        const grid = this.jsxw.grid();
        const numbering = grid.gridNumbering();

        // Assign new numbers
        for (let y = 1; y <= height; y++) {
          for (let x = 1; x <= width; x++) {
            const cell = this.getCell(x, y);
            this.updateCell(cell, { number: numbering[y - 1][x - 1] > 0 ? numbering[y - 1][x - 1] : null });
          }
        }



      } /* END renumbergrid() */

      /**
       * Handle mouse clicks on the crossword grid.
       * Works with any number of clue groups (not just Across/Down).
       */
      mouseClicked(e) {
        const offset = this.svg.offset();
        const scale = this.currentScale; // zoom scale variable
        const mouse_x = (e.pageX - offset.left) / scale;
        const mouse_y = (e.pageY - offset.top) / scale;
        //const mouse_x = e.pageX - offset.left;
        //const mouse_y = e.pageY - offset.top;
        const index_x = Math.ceil(mouse_x / this.cell_size);
        const index_y = Math.ceil(mouse_y / this.cell_size);
        const clickedCell = this.getCell(index_x, index_y);


        if (!clickedCell) return;

        if (this.diagramless_mode) {
          if (!clickedCell) return;

          // If user clicks the same cell again, toggle direction (just like normal puzzles)
          if (
            this.selected_cell &&
            this.selected_cell.x === index_x &&
            this.selected_cell.y === index_y &&
            clickedCell.type !== 'block'
          ) {
            this.toggleDiagramlessDir(); // <-- Step 2 helper
            if (!isMobile) this.hidden_input.focus();
            return;
          }

          // Otherwise, select the clicked cell without tying to any word
          this.setSelectedCell(clickedCell);
          this.setSelectedWord(null);
          this.top_text.html('');
          if (!isMobile) this.hidden_input.focus();
          return; // prevent falling through to normal-puzzle logic
        }

        // --- Normal puzzle mode ---
        const sameCellClicked =
          this.selected_cell &&
          this.selected_cell.x === index_x &&
          this.selected_cell.y === index_y;

        if (sameCellClicked) {
          // Cycle to the next clue group if clicking same square again
          this.changeActiveClues();
        }

        // Try to find a matching word in the current group
        let currentGroup = this.clueGroups[this.activeClueGroupIndex];
        let matchingWord = currentGroup.getMatchingWord(index_x, index_y, true);

        // If not found, try other groups in order
        if (!matchingWord) {
          for (let i = 0; i < this.clueGroups.length; i++) {
            if (i === this.activeClueGroupIndex) continue;
            const testGroup = this.clueGroups[i];
            const testWord = testGroup.getMatchingWord(index_x, index_y, true);
            if (testWord) {
              matchingWord = testWord;
              this.activeClueGroupIndex = i; // switch to that group
              break;
            }
          }
        }

        // If still nothing found, just stay on current group
        if (matchingWord) {
          this.setActiveWord(matchingWord);
        } else {
          // If no matching word found and current group is fake, clear top text
          const currentGroup = this.clueGroups[this.activeClueGroupIndex];
          if (this.fakeclues || (currentGroup && currentGroup.isFake)) {
            this.top_text.html('');
          }
        }

        // Update cell selection and redraw
        this.setActiveCell(clickedCell);

        if (!IS_MOBILE) {
          this.hidden_input.focus();
        }
      }

      /*keyPressedThenCheck(e) {
        this.keyPressed(e);
        }
        */
      keyPressed(e) {
        if (this.settings_open) {
          return;
        }

        // Prevent typing letters into the grid if an editable clue note is focused
        if (document.activeElement.classList.contains('cw-input')) {
          return;
        }

        // to prevent event propagation for specified keys
        var prevent = [35, 36, 37, 38, 39, 40, 32, 46, 8, 9, 13].indexOf(e.keyCode) >= 0;

        switch (e.keyCode) {
          case 35: // end
            this.moveToFirstCell(true);
            break;
          case 36: // home
            this.moveToFirstCell(false);
            break;
          case 37: // left
            if (this.diagramless_mode) this.setDiagramlessDir('across'); // set BEFORE moving
            if (e.shiftKey) {
              this.skipToWord(SKIP_LEFT);
            } else {
              this.moveSelectionBy(-1, 0);
            }
            break;
          case 38: // up
            if (this.diagramless_mode) this.setDiagramlessDir('down'); // vertical mode (set BEFORE)
            if (e.shiftKey) {
              this.skipToWord(SKIP_UP);
            } else {
              this.moveSelectionBy(0, -1);
            }
            break;
          case 39: // right
            if (this.diagramless_mode) this.setDiagramlessDir('across'); // set BEFORE moving
            if (e.shiftKey) {
              this.skipToWord(SKIP_RIGHT);
            } else {
              this.moveSelectionBy(1, 0);
            }
            break;
          case 40: // down
            if (this.diagramless_mode) this.setDiagramlessDir('down'); // vertical mode (set BEFORE)
            if (e.shiftKey) {
              this.skipToWord(SKIP_DOWN);
            } else {
              this.moveSelectionBy(0, 1);
            }
            break;

          case 32: // space

            if (this.diagramless_mode) {
              // Toggle direction in diagramless on Space
              if (this.selected_cell) {
                this.toggleDiagramlessDir();
              }
              break; // prevent falling into normal space behavior
            }

            if (this.selected_cell && this.selected_word) {
              // check config
              if (this.config.space_bar === 'space_switch') {
                const {
                  x,
                  y
                } = this.selected_cell;
                const groups = this.clueGroups || [];
                const n = groups.length;

                if (n > 1) {
                  this.changeActiveClues();
                  this.setActiveCell(this.selected_cell);
                }
              } else {
                // --- normal space behavior: clear and move to next cell
                this.updateCell(this.selected_cell, { letter: '', checked: false });
                this.saveAndUpdateStats();
                const next_cell = this.selected_word.getNextCell(
                  this.selected_cell.x,
                  this.selected_cell.y
                );
                this.setActiveCell(next_cell);
              }
            }

            this.checkIfSolved(); // update solved status
            break;

          case 27: // escape -- pulls up a rebus entry
            if (e.shiftKey) {
              e.preventDefault();
              this.toggleTimer();
            } else {
              if (false && (this.selected_cell && (this.selected_word || this.diagramless_mode))) {
                this.hidden_input.val('');
                var rebus_entry = prompt('Rebus entry', '');
                this.hiddenInputChanged(rebus_entry);
              }
            }
            break;
          case 45:            // insert -- reveal letter
            if (e.shiftKey) { // SHIFT insert -- reveal word, BUT do not count as cheat : typing accelerator
                this.check_reveal( 'word', 'reveal', true); // 3rd parameter will be treated NOT as event but as boolean skipCheat = true
            } else if (e.ctrlKey) { // CTRL insert : real cheating.
                this.check_reveal( 'word', 'reveal');
            } else {
                this.check_reveal( 'letter', 'reveal');
            }
            break;
          case 46: // delete
            if (this.selected_cell && !this.selected_cell.fixed) {
              this.updateCell(this.selected_cell, {
                letter: '',
                checked: false
              });
              this.saveAndUpdateStats();
            }
            // Update this.isSolved
            this.checkIfSolved();
            break;
          case 8: // backspace
            if (this.selected_cell && !this.selected_cell.fixed) {
              this.updateCell(this.selected_cell, {
                letter: '',
                checked: false
              });
              this.saveAndUpdateStats();

              if (this.diagramless_mode) {
                // Move to the previous editable cell based on current diagramless direction
                const prev = this.nextDiagramlessCell(this.selected_cell, this.diagramless_dir, -1);
                if (prev) this.setActiveCell(prev);
              } else if (this.selected_word) {
                const prev_cell = this.selected_word.getPreviousCell(
                  this.selected_cell.x,
                  this.selected_cell.y
                );
                this.setActiveCell(prev_cell);
              }

              this.checkIfSolved();
            }
            break;
          case 9: // tab
          case 13: // enter key -- same as tab
            var skip_filled_words = this.config.tab_key === 'tab_skip';
            if (e.shiftKey) {
              this.moveToNextWord(true, skip_filled_words);
            } else {
              this.moveToNextWord(false, skip_filled_words);
            }
            break;
          case 190: // "." key pressed
            if (this.selected_cell && (e.ctrlKey || e.metaKey)) {
              // ctrl + "." toggles circle
              const cell = this.selected_cell;
              this.updateCell(cell, {
                shape: cell.shape === 'circle' ? null : 'circle'
              });
              if (!IS_MOBILE) {
                this.hidden_input.focus();
              }
              prevent = true;
              break;
            }

            if (this.diagramless_mode && this.selected_cell) {
              const cell = this.selected_cell;

              // Toggle block / white
              if (cell.type === 'block') {
                // It is currently a block: make it white again
                this.updateCell(cell, {
                  type: null,
                  empty: false,
                  letter: ''
                });
              } else {
                // It is currently white: make it a block
                this.updateCell(cell, {
                  type: 'block',
                  empty: true,
                  letter: ''
                });
              }

              // Renumber immediately
              this.renumberGrid();

              if (!IS_MOBILE) {
                this.hidden_input.focus();
              }
            }
            prevent = true;
            break;
          default: {
             const isLetter = e.key.length === 1 && /^[a-z]$/i.test(e.key);
             if (this.selected_cell && isLetter && !this.selected_cell.fixed) {
               const ch = e.key.toUpperCase();
              this.updateCell(this.selected_cell, {
                letter: ch,
                checked: false
              });
              this.saveAndUpdateStats();
              this.checkIfSolved();
              if (!IS_MOBILE) {
                this.hidden_input.focus();
              }

              let next_cell = null;

              if (this.diagramless_mode) {
                // Move in the current diagramless direction (across or down)
                next_cell = this.nextDiagramlessCell(this.selected_cell, this.diagramless_dir, +1);
              } else if (this.selected_word) {

                if (this.config.skip_filled_letters && !this.selected_word.isFilled()) {
                  next_cell = this.selected_word.getFirstEmptyCell(
                    this.selected_cell.x,
                    this.selected_cell.y
                  ) || this.selected_word.getNextCell(
                    this.selected_cell.x,
                    this.selected_cell.y
                  );
                } else {
                  next_cell = this.selected_word.getNextCell(
                    this.selected_cell.x,
                    this.selected_cell.y
                  );
                }
              }

              // dont change cell if wrong:
              if (this.v_autocheck && (this.selected_cell.letter != this.selected_cell.solution)) next_cell=null;
              if (next_cell) {
                this.setActiveCell(next_cell);
              }
            }
            break;
          }
        } //SWITCH
        if (prevent) {
          e.preventDefault();
          e.stopPropagation();
        }

        // redisplay word in the upper box:
        if (this.selected_cell && this.selected_word) {
          var i,
            word,
            x = this.selected_cell.x,
            y = this.selected_cell.y;
            word = this.clueGroups[this.activeClueGroupIndex].getMatchingWord(x, y);
            if (word) { this.setActiveWord(word); }
        }
  } //FUNCTION keyPressed

      saveAndUpdateStats() {
        this.saveGame(); // save locally and to backend if present
        this.updateStatsUI();

        /* unused code for us
        if (this.is_autofill && this.selected_cell) {
          const key = this.selected_cell.number || this.selected_cell.top_right_number;
          const same_number_cells = this.number_to_cells[key] || [];

          for (const cell of same_number_cells) {
            if (cell !== this.selected_cell) {
              this.updateCell(cell, {
                letter: this.selected_cell.letter,
                checked: this.selected_cell.checked
              });
            }
          }
        }
       */
      }

      // Detects user inputs to hidden input element
      hiddenInputChanged(rebus_string) {
        var next_cell;
        if (this.selected_cell) {
          if (rebus_string && rebus_string.trim()) { //mobile case rebus_string= letter entered
            this.selected_cell.letter = rebus_string.toUpperCase(); // ✅ Use rebus string if available
            if (this.v_autocheck && (this.selected_cell.letter != this.selected_cell.solution)) { // wrong entry
              this.updateCell(this.selected_cell, { letter: this.selected_cell.letter,  checked: true });
              next_cell=null;
              return;
              }
          } else {
            const mychar = this.hidden_input.val().slice(0, 1).toUpperCase();
            if (mychar) {
              this.updateCell(this.selected_cell, { letter: mychar });
            }
          }
          this.updateCell(this.selected_cell, {
            checked: false
          });

          // If this is a coded or acrostic
          // find all cells with this number
          // and fill them with the same letter
          this.saveAndUpdateStats();

          // this call can be avoided:
          //this.renderCells("userInput1"); // Re-render SVG grid immediately after user input

          // find empty cell, then next cell
          // Change this depending on config
          if (this.config.skip_filled_letters) {
            next_cell =
              this.selected_word.getFirstEmptyCell(
                this.selected_cell.x,
                this.selected_cell.y
              ) ||
              this.selected_word.getNextCell(
                this.selected_cell.x,
                this.selected_cell.y
              );
          } else {
            next_cell = this.selected_word.getNextCell(
              this.selected_cell.x,
              this.selected_cell.y
            );
          }

          this.setActiveCell(next_cell);
          // this call can be avoided (setActiveCell has called renderCells)
          //this.renderCells("userInput2"); // Re-render SVG grid immediately after user input
          this.checkIfSolved()
        }
        this.hidden_input.val('');
      }

      checkIfSolved(do_reveal = false) {
        var wasSolved = this.isSolved;
        var i, j, cell;
        for (i in this.cells) {
          for (j in this.cells[i]) {
            cell = this.cells[i][j];
            // if found cell without letter or with incorrect letter - return
            if (
              (!cell.empty && (!cell.letter || !isCorrect(cell.letter, cell.solution))) ||
              (this.diagramless_mode && ((cell.type === 'block') !== (cell.solution === '#')))
            ) {
              this.isSolved = false;
              return;
            }
          }
        }
        // Puzzle is solved!
        this.isSolved = true;
        // stop the timer
        var timerMessage = '';
        if (this.timer_running) {
          // prepare message based on time
          var display_seconds = xw_timer_seconds % 60;
          var display_minutes = (xw_timer_seconds - display_seconds) / 60;
          var minDisplay = display_minutes == 1 ? 'minute' : 'minutes';
          var secDisplay = display_seconds == 1 ? 'second' : 'seconds';
          var allMin = display_minutes > 0 ? `${display_minutes} ${minDisplay} ` : '';
          timerMessage = `<br /><br /><center>You finished in ${allMin} ${display_seconds} ${secDisplay}.</center>`;

          // stop the timer
          clearTimeout(xw_timer);
          this.timer_button.removeClass('running');
          this.timer_running = false;
        }
        // reveal all (in case there were rebuses)
        if (do_reveal) {
          this.check_reveal('puzzle', 'reveal');
        }

        if (this.config.confetti_enabled) {
          confetti({
            particleCount: 280,
            spread: 190,
            origin: {
              y: 0.4
            }
          });
        }
        this.saveGame()

        /* const winSound = new Audio('./sounds/hny.mp3');
           winSound.play();*/
        const here = this

        function showSuccessMsg(rawMessage) {

          let solvedMessage = escape(rawMessage).trim().replaceAll('\n', '<br />');
          solvedMessage += timerMessage;
          here.createModalBox('🎉🎉🎉', solvedMessage);
        }

        // show completion message if newly solved
        if (!wasSolved) {
          showSuccessMsg(this.completion_message);
        }
      }

      // callback for shift+arrows
      // finds next cell in specified direction that does not belongs to current word
      // then selects that word and selects its first empty || first cell
      skipToWord(direction) {
        if (this.selected_cell && this.selected_word) {
          var i,
            cell,
            word,
            word_cell,
            x = this.selected_cell.x,
            y = this.selected_cell.y;

          var cellFound = (cell) => {
            if (cell && !cell.empty) {
              word = this.clueGroups[this.activeClueGroupIndex].getMatchingWord(cell.x, cell.y);
              if (word && word.id !== this.selected_word.id) {
                word_cell = word.getFirstEmptyCell() || word.getFirstCell();
                this.setActiveWord(word);
                this.setActiveCell(word_cell);

                return true;
              }
            }
            return false;
          };

          switch (direction) {
            case SKIP_UP:
              for (i = y - 1; i >= 0; i--) {
                cell = this.getCell(x, i);
                if (cellFound(cell)) {
                  return;
                }
              }
              break;
            case SKIP_DOWN:
              for (i = y + 1; i <= this.grid_height; i++) {
                cell = this.getCell(x, i);
                if (cellFound(cell)) {
                  return;
                }
              }
              break;
            case SKIP_LEFT:
              for (i = x - 1; i >= 0; i--) {
                cell = this.getCell(i, y);
                if (cellFound(cell)) {
                  return;
                }
              }
              break;
            case SKIP_RIGHT:
              for (i = x + 1; i <= this.grid_width; i++) {
                cell = this.getCell(i, y);
                if (cellFound(cell)) {
                  return;
                }
              }
              break;
          }
        }
      }

      /**
       * Move to the next or previous word, cycling through all clue groups.
       */
      moveToNextWord(to_previous, skip_filled_words = false) {
        if (!this.selected_word || !this.clueGroups?.length) return;

        let next_word = null;
        let this_word = this.selected_word;
        let groupIndex = this.activeClueGroupIndex ?? 0;
        const totalGroups = this.clueGroups.length;
        let safetyCounter = 0; // counts how many times we've wrapped between groups
        const shouldSkipFilledWords =
          skip_filled_words && this.hasUnfilledWords();

        while (safetyCounter < totalGroups * 2) {
          const currentGroup = this.clueGroups[groupIndex];

          // Try to get next/prev word within the current group
          next_word = to_previous ?
            currentGroup.getPreviousWord(this_word) :
            currentGroup.getNextWord(this_word);

          if (!next_word) {
            // Reached end/start of group — wrap to next/previous group
            groupIndex = (groupIndex + 1) % totalGroups;
            this.activeClueGroupIndex = groupIndex;
            safetyCounter++; // only increment when we move between groups

            const nextGroup = this.clueGroups[groupIndex];
            next_word = to_previous ?
              nextGroup.getLastWord() :
              nextGroup.getFirstWord();
          }

          // Stop if this word is acceptable (either not filled or skipping disabled)
          if (!shouldSkipFilledWords || !next_word.isFilled()) break;

          // Otherwise, continue searching
          this_word = next_word;
        }

        // Activate new word if found
        if (next_word) {
          const cell = next_word.getFirstEmptyCell() || next_word.getFirstCell();
          this.setActiveWord(next_word);
          this.setActiveCell(cell);
        }
      }

      hasUnfilledWords() {
        return Object.values(this.words || {}).some(
          (word) => word && !word.isFilled()
        );
      }

      moveToFirstCell(to_last) {
        if (this.selected_word) {
          var cell = to_last ?
            this.selected_word.getLastCell() :
            this.selected_word.getFirstCell();
          if (cell) {
            this.setActiveCell(cell);
          }
        }
      }

      /**
       * Callback for arrow keys
       * Moves selection by one cell, possibly switching clue groups.
       * Works with any number of clue lists.
       */
      moveSelectionBy(delta_x, delta_y, jumping_over_black) {

        // Diagramless mode
        if (this.diagramless_mode && this.selected_cell) {
          const x = this.selected_cell.x + delta_x;
          const y = this.selected_cell.y + delta_y;
          const new_cell = this.getCell(x, y);
          if (new_cell) { // skip normal crossword movement logic
            this.selected_cell = new_cell;
          }
          return;
        }

        // Don't do anything if there's no selected cell
        if (!this.selected_cell) return;

        // Find the new cell in the specified direction
        let x = this.selected_cell.x + delta_x;
        let y = this.selected_cell.y + delta_y;
        let new_cell = this.getCell(x, y);

        if (!new_cell) return; // out of bounds

        // Try to jump over black (empty) cells
        if (new_cell.empty) {
          if (delta_x < 0) delta_x--;
          else if (delta_x > 0) delta_x++;
          else if (delta_y < 0) delta_y--;
          else if (delta_y > 0) delta_y++;
          this.moveSelectionBy(delta_x, delta_y, true);
          return;
        }

        // All clue groups
        const groups = this.clueGroups || [];
        const n = groups.length;
        if (!n) return;

        // Active clue group
        let activeGroup = groups[this.activeClueGroupIndex];

        // If new cell is outside current word
        if (!this.selected_word.hasCell(x, y)) {
          let selectedCellAltWord = null;
          let newCellAltWord = null;
          let altGroupIndex = this.activeClueGroupIndex;

          // Try to find an alternate word (perhaps in an inactive clue list) that includes current + next cell
          for (let offset = 1; offset < n; offset++) {
            const i = (this.activeClueGroupIndex + offset) % n;
            const group = groups[i];
            const match1 = group.getMatchingWord(this.selected_cell.x, this.selected_cell.y, true);
            const match2 = group.getMatchingWord(new_cell.x, new_cell.y, true);
            if (match1 && match2 && match1.id === match2.id) {
              selectedCellAltWord = match1;
              newCellAltWord = match2;
              altGroupIndex = i;
              break;
            }
          }

          // Case 1: Found a matching word in another group (switch direction)
          if (selectedCellAltWord && newCellAltWord) {
            this.activeClueGroupIndex = altGroupIndex;
            this.changeActiveClues(altGroupIndex);
            activeGroup = groups[altGroupIndex];

            // arrow-stay / arrow-move_filled config logic
            if (
              this.config.arrow_direction === 'arrow_stay' ||
              (!this.selected_cell.letter && this.config.arrow_direction === 'arrow_move_filled')
            ) {
              new_cell = this.selected_cell;
            }
          }

          // Case 2: If the new cell has no word in the current group, switch groups
          let newCellActiveWord = activeGroup.getMatchingWord(new_cell.x, new_cell.y, true);
          if (!newCellActiveWord) {
            // find the first group that *does* have a word here
            for (let offset = 1; offset < n; offset++) {
              const i = (this.activeClueGroupIndex + offset) % n;
              const group = groups[i];
              const candidate = group.getMatchingWord(x, y, true);
              if (candidate) {
                newCellActiveWord = candidate;
                this.activeClueGroupIndex = i;
                break;
              }
            }
          }

          // Always update active word
          if (newCellActiveWord) {
            this.setActiveWord(newCellActiveWord);
          }
        }

        this.setActiveCell(new_cell);
      } // END moveSelectionBy()


      windowResized() {
        if (IS_MOBILE) { return;}
        setBreakpointClasses(this.root);
        resizeText(this.root, this.top_text);
        this.positionGrid();
        this.syncTopTextWidth();
      }

      syncTopTextWidth() {
        if (IS_MOBILE) { return;}
        const svgEl = this.svgContainer;
        const wrapper = this.toptext?.get(0);

        if (!svgEl || !wrapper) return;

        const bbox = svgEl.getBoundingClientRect();
        const containerBox = svgEl.parentNode.getBoundingClientRect();

        const leftOffset = bbox.left - containerBox.left;
        const width = Math.round(bbox.width);

        wrapper.style.position = 'absolute';
        wrapper.style.left = `${leftOffset}px`;
        wrapper.style.width = `${width}px`;

        // Optional debug log
        requestAnimationFrame(() => {
          const actual = wrapper.getBoundingClientRect();
        });
      }

      waitUntilSVGWidthStabilizes(finalCallback) {
        let lastWidth = null;
        let stableCount = 0;
        let tick = 0;

        const check = () => {
          const svg = this.svgContainer;
          const width = svg?.getBoundingClientRect().width || 0;

          if (lastWidth !== null && width === lastWidth) {
            stableCount++;
          } else {
            stableCount = 0;
          }

          if (stableCount >= 3) {
            finalCallback();
          } else if (tick < 30) {
            lastWidth = width;
            tick++;
            setTimeout(check, 100);
          } else {
            finalCallback();
          }
        };

        check();
      }

      // callback for clicking a clue in the sidebar
      clueClicked(e) {
        const target = $(e.currentTarget);
        const clue = target.data('clue');
        const wordId = target.data('word');
        const word = this.words[wordId];

        // Find which clue group this clue belongs to
        const clickedGroupId = target.data('clues');
        const groupIndex = this.clueGroups.findIndex(g => g.id === clickedGroupId);
        const group = this.clueGroups[groupIndex];

        if (this.fakeclues || (group && group.isFake)) {
          // Toggle "completed" state on the clue itself
          clue.fakeClueCompleted = !Boolean(clue.fakeClueCompleted);

          // Update this specific clue element immediately
          this.updateClueAppearance(clue, target);
          return;
        }

        if (!word) return;

        if (this.diagramless_mode) return;

        const cell = word.getFirstEmptyCell() || word.getFirstCell();
        if (!cell) return;

        // Switch directly to that group if needed
        if (groupIndex !== -1 && groupIndex !== this.activeClueGroupIndex) {
          this.changeActiveClues(groupIndex);
        }

        this.setActiveWord(word);
        this.setActiveCell(cell);
      }

      showInfo() {
        this.createModalBox(
          'Info',
          `
            <p><b>Title: ${this.title}</b></p>
            ${this.voltitle ? `<p><b>Volume: </b>${this.voltitle}</p>` : ''}
            <p><b>Author:</b> ${escape(this.author)}</p>
            <p><b>Notes:</b> ${escape(this.puznotes)}</p>
            <p><b>Dimensions:</b> ${this.grid_width}x${this.grid_height}</b></p>
          `
        );
      }

      showNotepad() {
        this.createModalBox('Notes', escape(this.notepad));
      }

      /**
       * Normalize selected text to letters only (A–Z).
       */
      lettersOnly(text) {
        return (text || "")
          .toUpperCase()
          .replace(/[^A-Z]/g, "");
      }


      openSettings() {
        // Create a modal box
        var settingsHTML = `
        <div class="settings-wrapper">
          <!-- Skip filled letters -->
          <div class="settings-setting">
            <div class="settings-description">
              While filling a word
            </div>
            <div class="settings-option">
              <label class="settings-label">
                <input id="skip_filled_letters" checked="checked" type="checkbox" name="skip_filled_letters" class="settings-changer">
                  Skip over filled letters
                </input>
              </label>
            </div>
            <div class="settings-option">
              <label class="settings-label">
                <input id="gray_completed_clues" type="checkbox" name="gray_completed_clues" class="settings-changer">
                  Gray out clues for completed words
                </input>
              </label>
            </div>
          </div>

          <!-- When changing direction with arrow keys -->
          <div class="settings-setting">
            <div class="settings-description">
              When changing direction with arrow keys
            </div>
            <div class="settings-option">
              <label class="settings-label">
                <input id="arrow_stay" checked="" type="radio" name="arrow_direction" class="settings-changer">
                  Stay in the same square
                </input>
              </label class="settings-label">
              <label class="settings-label">
                <input id="arrow_move" checked="" type="radio" name="arrow_direction" class="settings-changer">
                  Move in the direction of the arrow
                </input>
              </label>
              <label class="settings-label">
                <input id="arrow_move_filled" checked="" type="radio" name="arrow_direction" class="settings-changer">
                  Move in the direction of the arrow if the square is filled
                </input>
              </label>
            </div>
          </div>

          <!-- Space bar -->
          <div class="settings-setting">
            <div class="settings-description">
              When pressing space bar
            </div>
            <div class="settings-option">
              <label class="settings-label">
                <input id="space_clear" checked="" type="radio" name="space_bar" class="settings-changer">
                  Clear the current square and move forward
                </input>
              </label class="settings-label">
              <label class="settings-label">
                <input id="space_switch" checked="" type="radio" name="space_bar" class="settings-changer">
                  Switch directions
                </input>
              </label>
            </div>
          </div>

          <!-- Tab key -->
          <div class="settings-setting">
            <div class="settings-description">
              When tabbing
            </div>
            <div class="settings-option">
              <label class="settings-label">
                <input id="tab_noskip" checked="" type="radio" name="tab_key" class="settings-changer">
                  Move to the next word
                </input>
              </label class="settings-label">
              <label class="settings-label">
                <input id="tab_skip" checked="" type="radio" name="tab_key" class="settings-changer">
                  Move to the next unfilled word
                </input>
              </label>
            </div>
          </div>

          <!-- Miscellaneous -->
          <div class="settings-setting">
            <div class="settings-description">
              Miscellaneous
            </div>
            <div class="settings-option">
              <label class="settings-label">
                <input id="timer_autostart" checked="" type="checkbox" name="timer_autostart" class="settings-changer">
                  Start timer on puzzle open
                </input>
              </label>
            </div>
            <div class="settings-option">
              <label class="settings-label">
                <input id="confetti_enabled" checked="" type="checkbox" name="confetti_enabled" class="settings-changer">
                  Confetti on solve
                </input>
              </label>
            </div>
            <div class="settings-option">
              <label class="settings-label">
                <input id="autocheck2" checked="" type="checkbox" name="autocheck2" class="xx-settings-changer">
                  Autocheck (🅰️)
                </input>
              </label>
            </div>
            <div class="settings-option">
              <label class="settings-label">
                <input id="display-cn" checked="" type="checkbox" name="display-cn" class="yy-settings-changer">
                  Display cell numbers
                </input>
              </label>
            </div>
            <div class="settings-option">
              <label class="settings-label">
                <input id="display-cheats" checked="" type="checkbox" name="display-cheats" class="yy-settings-changer">
                  Display cheats marks in grid
                </input>
              </label>
            </div>
            <div class="settings-option">
              <label class="settings-label" backend-required>
                <input id="autosave2" checked="" type="checkbox" name="autosave2" class="z-settings-changer">
                  Autosave Crossword (&#8597;&#65039;)
                </input>
              </label>
            </div>


            <!--
            <div class="settings-option">
              <label class="settings-label">
                <input id="dark_mode_enabled" checked="" type="checkbox" name="dark_mode_enabled" class="settings-changer">
                  Dark mode
                </input>
              </label>
            </div>
            -->
          </div>
        `;

        this.createModalBox('Settings', settingsHTML);
        $('#autocheck2').prop('checked', this.v_autocheck);
        $('#autosave2').prop('checked', this.v_autosave);
        $('#display-cn').prop('checked', v_display_cn);
        $('#display-cheats').prop('checked', this.v_displayCheatMarks);
        document.querySelectorAll('.sync-emoji').forEach(el => { el.style.display = this.v_autosave ? '' : 'none'; });
        document.querySelectorAll('.autocheck-emoji').forEach(el => { el.style.display = this.v_autocheck ? '' : 'none'; });
        // Show the proper value for each of these fields
        var classChangers = document.getElementsByClassName('settings-changer');
        for (var cc of classChangers) {
          if (cc.type === 'radio') {
            document.getElementById(cc.id)['checked'] =
              this.config[cc.name] === cc.id;
          } else {
            // checkbox
            document.getElementById(cc.id)['checked'] = this.config[cc.name];
          }
        }
        // Add a listener for these events
        this.root
          .find('.settings-wrapper')
          .get(0)
          .addEventListener('click', (event) => {
            if (event.target.name == 'autocheck2' ) {
                this.toggleAutoCheck();
            }
            if (event.target.name == 'autosave2' ) {
                this.toggleAutoSave();
            }
            if (event.target.name == 'display-cn' ) {
                this.toggleClueNumbers();
            }
            if (event.target.name == 'display-cheats' ) {
                this.toggleDisplayCheats();
            }
            if (event.target.className === 'settings-changer') {
              if (event.target.type === 'checkbox') {
                this.config[event.target.name] = event.target.checked;

                // Toggle dark mode via CSS class
                if (event.target.name == 'dark_mode_enabled') {
                  document.body.classList.toggle('dark-mode', event.target.checked);
                  this.updateCSS(this.config.color_word, this.config.color_selected);
                  this.renderCells();
                }

                // If the toggled setting is gray_completed_clues, re-render clues immediately
                if (event.target.name === 'gray_completed_clues') {
                  this.styleClues();
                  this.syncTopTextWidth();
                }

              } else if (event.target.type === 'radio') {
                this.config[event.target.name] = event.target.id;
              }
            }
            this.saveSettings();
          });
      } // OPEN SETTINGS

      fillJsXw() {
        const cells = this.cells;
        this.jsxw.cells.forEach((c) => {
          const x = c.x;
          const y = c.y;
          const cellData = cells[x + 1][y + 1];

          c.letter = cellData.letter;
          c.top_right_number = cellData.top_right_number;

          // for diagramless purposes
          c.type = cellData.type;

          /* J : not used
          if (cellData.fixed === true) {
            c.fixed = true;
          } else {
            delete c.fixed; // Ensure normal cells are not accidentally flagged
          }
          */
        });
      }

      /** Re-apply settings from localforage asynchronously after the constructor. */
      async _loadSettingsAsync(user_config) {
        try {
          const saved_settings = await localforage.getItem(SETTINGS_STORAGE_KEY);
          if (saved_settings && typeof saved_settings === 'object') {
            const configurable_settings_set = new Set(CONFIGURABLE_SETTINGS);
            for (const key in saved_settings) {
              if (saved_settings.hasOwnProperty(key) && configurable_settings_set.has(key)) {
                this.config[key] = saved_settings[key];
              }
            }
          }
        } catch (err) {
          console.warn('[localforage] Could not load settings:', err);
        }
      }

      /** Save user-configurable settings to localforage (async, fire-and-forget). */
      saveSettings() {
        // we only save settings that are configurable
        var ss1 = { ...this.config };
        var savedSettings = {};
        CONFIGURABLE_SETTINGS.forEach(function(x) {
          savedSettings[x] = ss1[x];
        });
        localforage.setItem(SETTINGS_STORAGE_KEY, savedSettings).catch(function(err) {
          console.warn('[localforage] Could not save settings:', err);
        });
      }

      toggleClueNumbers(e) {
        v_display_cn = !v_display_cn;
        if (v_display_cn) {
            $('.cw-cell-number').show();
        } else {
            $('.cw-cell-number').hide();
        }
        this.renderCells();  // FIX ?
      }
      toggleDisplayCheats(e) {
        this.v_displayCheatMarks = !this.v_displayCheatMarks;
        this.renderCells();  //FIX ?
      }

      toggleAutoCheck(e) {
        this.v_autocheck = !this.v_autocheck;
        const menu = document.querySelector('.cw-check');
        menu.style.display = this.v_autocheck ? 'none' : 'block';
        $('#autocheck1').prop('checked', this.v_autocheck);
        if (this.v_autocheck) { this.check_reveal('puzzle', 'check'); } 
        document.querySelectorAll('.autocheck-emoji').forEach(el => { el.style.display = this.v_autocheck ? '' : 'none'; });
      }

      toggleAutoSave(e) {
        this.v_autosave = !this.v_autosave;
        $('#autosave1').prop('checked', this.v_autosave);
        $('#autosave2').prop('checked', this.v_autosave);
        document.querySelectorAll('.sync-emoji').forEach(el => { el.style.display = this.v_autosave ? '' : 'none'; });
      }

      
      /**
       * Gets translation for a specific clue number from cache or backend
       * @param {string|number} n - The clue number (e.g., 51)
       * @param {string} direction - Across or Down
       * @returns {Promise<string>} - The translated text or empty string
       */
      async getTranslation(n, direction) {
        const isAvailable = await this.backendPromise;
        if (!isAvailable || !this.md5grid) return '';
    
        if (this.puzlang && this.puzlang !== 'en') {
            return '';
        }

        try {
            if (!this.translatedClues) {
                console.log("Fetching translation dictionary from backend...");
                const response = await fetch("/cgi-lmpuz/translate.py", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ md5grid: this.md5grid }) // Added 'this.'
                });

                if (!response.ok) throw new Error("Network response was not ok");
    
                const data = await response.json();
                // Assign to property without 'const' and strip the hash wrapper
                this.translatedClues = data[this.md5grid] || Object.values(data)[0];
            }

            const clueNum = n.toString();
            // This will now find 'Across' or 'Down' correctly
            return this.translatedClues[direction]?.[clueNum] || '';
    
        } catch (error) {
            console.error("Translation error:", error);
            return '';
        }
      }
      
      /* load last state from DB */
      async loadDb(e) {
        const isAvailable = await this.backendPromise; // will wait until decision about backend is made
        if (!isAvailable) return;
        this.fillJsXw();
        try {
            const response = await fetch(this.back_loadDB, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(this.jsxw)
            });

            if (!response.ok) {
                alert(`service not available: ${response.status}`);
                return; 
            }
            const data = await response.json();
            console.log("json returned by nexus_update:", data);
            if (data.status != 0) {
                if (data.status == 2) this.toggleAutoSave(); // NO puz found with this ID
                alert(data.message);
                }
            else {
                const state = data.state
                this.updateCellsFromState(this.cells, state);

                this.stat_errors = {};
                this.stat_cheated = {};

                // ?.length (Optional Chaining): This safely checks if the list exists and has items in one short expression. If error_list is undefined, it simply skips the block.
                // Reconstruct stats from simple arrays [ "x1,y1", "x2,y2" ] => stat_errors ={ "x1,y1": true, ...}
                this.stat_errors = data.error_list?.length ? Object.fromEntries(data.error_list.map(c => [c, true])) : {};
                this.stat_cheated = data.cheated_list?.length ? Object.fromEntries(data.cheated_list.map(c => [c, true])) : {};
                xw_timer_seconds = data.timeplayed ?? 0;

                this.renderCells(); 
                this.updateStatsUI();
            }
    
        } catch (error) {
            console.error('Error loading stats:', error);
        }
     }
// Example usage:
// const state = '-----CAUSA-.-------------';
    updateCellsFromState(cells, stateString) {
      const height = this.grid_height;
      const width = this.grid_width;
      for (let y = 1; y <= height; y++) {
        for (let x = 1; x <= width; x++) {
            const index = (y - 1) * width + (x - 1);
            const char = stateString[index];
            const cell = cells[x][y];
            if (char === '-' || char === '.') {
                cell.letter = "";
            } else {
                cell.letter = char;
            }
        }
      }
    console.log("Grid updated.");
  }

    /* Save the game state to DB */
    async saveDb(e, mustFill=true) {
        if (typeof e === 'boolean') {
            mustFill = e;
            e = null;
        }
        const isAvailable = await this.backendPromise;
        if (! this.v_autosave || !isAvailable) return;
        if (this.is_saving) return; // Exit if a save is already running
        this.is_saving = true;
    
        if (mustFill) this.fillJsXw();
        const payload = {
            ...this.jsxw,
            error_list: Object.keys(this.stat_errors),
            cheated_list: Object.keys(this.stat_cheated),
            timeplayed: xw_timer_seconds
        };
    
        try {
            const stream = new Blob([JSON.stringify(payload)], { type: 'application/json' }).stream();
            const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
            const compressedBody = await new Response(compressedStream).blob();
    
            const response = await fetch(this.back_saveDB, {
                method: 'POST',
                referrerPolicy: 'no-referrer',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Encoding': 'gzip'
                },
                body: compressedBody
            });
    
            if (!response.ok) {
                alert(`Backend seems not available: ${response.status}\nAutosave disabled`);
                this.toggleAutoSave();
                return; 
            }
            const data = await response.json();
            if (data.status != 0) {
                if (data.status == 2) this.toggleAutoSave(); // NO puz found with this ID
                alert(data.message);
                }
    
        } catch (error) {
            console.error('Error saveDB:', error);
        } finally {
            this.is_saving = false; // Always unlock, even on error
        }
    }

      /* Save the game to localforage (async) */
      async saveGame() {
        // fill jsxw
        this.fillJsXw();
        try {
          await localforage.setItem(this.savegame_name, this.jsxw.cells);
          await localforage.setItem(
            this.savegame_name + "_notes",
            Array.from(this.notes.entries()).map(n => ({ key: n[0], value: n[1] }))
          );
          await localforage.setItem(this.savegame_name + "_misc", {
            stat_cheated: this.stat_cheated,
            stat_errors: this.stat_errors,
            timeplayed: xw_timer_seconds,
            filename: this.filename,
            voltitle: this.volname,
            autocheck: this.v_autocheck,
            status: this.isSolved ? 2 : 1
          });
        } catch (err) {
          console.warn('[localforage] saveGame failed:', err);
        }

        /*localStorage.setItem(this.savegame_name + '_version', PUZZLE_STORAGE_VERSION);*/
        if (this.v_autosave) { this.saveDb(false);} // no fillJsXw required its just been done
      }

      /* Show "load game" menu" */
      async loadGameMenu() {
        // Find all the savegames from localforage
        var innerHTML = '';
        try {
          const keys = await localforage.keys();
          for (const thisKey of keys) {
            if (thisKey.startsWith(STORAGE_KEY) && !thisKey.includes('_notes') && !thisKey.includes('_misc') && !thisKey.includes('_version')) {
              var thisDisplay = thisKey.substr(STORAGE_KEY.length);
              innerHTML += `
              <label class="settings-label">
                <input id="${thisKey}" checked="" type="radio" class="loadgame-changer">
                  ${thisDisplay}
                </input>
              </label>
              `;
            }
          }
        } catch (err) {
          console.warn('[localforage] loadGameMenu failed:', err);
        }
        if (!innerHTML) {
          innerHTML = 'No save games found.';
        }

        // Create a modal box
        var loadgameHTML = `
        <div class="loadgame-wrapper">
          ${innerHTML}
        </div>
        `;
        this.createModalBox('Load Game', loadgameHTML);
      }

      /* Load a game from localforage (async) */
      async loadGame() {
        try {
          var jsxw_cells = await localforage.getItem(this.savegame_name);
          // don't actually *load* it, just return the jsxw
          return jsxw_cells;
        } catch (err) {
          console.warn('[localforage] loadGame failed:', err);
          return null;
        }
      }

// ----------------------- cheat & errors helpers -------------------------------//
      setError(x, y) {
          this.stat_errors[`${x},${y}`] = true;
      }

      setCheated(x, y) {
          this.stat_cheated[`${x},${y}`] = true;
      }

      total_errors() {
          return Object.keys(this.stat_errors).length;
      }

      total_cheated() {
          return Object.keys(this.stat_cheated).length;
      }

     getNonBlackCells() {
          return Object.values(this.cells).flatMap(col => Object.values(col)).filter(c => c.solution !== null).length;
     }

     updateStatsUI() {
        // 1. DOM Guard: Find elements first
        const el1 = document.getElementById('misc-stats');
        const el2 = document.getElementById('fake-btn-stats');

        // on mobile: update only when drawer is opened
        if (IS_MOBILE && !document.querySelector('.cw-buttons-drawer')?.classList.contains('open')) {
            return;
        }

        // 3. Exit if nowhere to print the data
        if (!el1 && !el2) return;

        // 4. Data Crunching only if elements exist
        const total = this.nonBlackCells;
        const cheated = this.total_cheated();
        const errors = this.total_errors();

        // Count cells that have a correct letter entered 
        let filled = 0;
        for (const col in this.cells) {
            for (const row in this.cells[col]) {
                const c = this.cells[col][row];
                if (c.solution !== null && c.letter === c.solution) filled++;
            }
        }

        // 5. Formatting
        const cheatedPct = Math.round((cheated / total) * 100);
        const errorsPct = Math.round((errors / total) * 100);
        const completedPct = Math.floor((filled / total) * 100);

        const stats = `Cheated: ${cheated} (${cheatedPct}%) • Errors: ${errors} (${errorsPct}%) • Completed: ${completedPct}%`;
        const MAX_WIDTH = 70; // may be adjusted
        let displayInfo = `${this.voltitle}${this.title} • ${this.author}`;
        if (displayInfo.length > MAX_WIDTH) {
            // If combined is too long, drop author
            displayInfo = `${this.voltitle}${this.title}`;

            // If still too long, truncate it
            if (displayInfo.length > MAX_WIDTH) {
                displayInfo = displayInfo.substring(0, MAX_WIDTH).trim() + '…';
            }
        }
        
        // 6. UI Update
        if (el1) el1.innerHTML = stats;
        if (el2) el2.textContent = stats;
        const el3 = document.getElementById('fake-btn-tit-auth');
        if (el3) el3.innerHTML = displayInfo;
        }

//-----------------------------------------------CHECK REVEAL ------------------------------------------------//     

      check_reveal(to_solve, reveal_or_check, e, skipCheat = false) {
        if (typeof e === 'boolean') {
            skipCheat = e;
            e = null;
        }
        var my_cells = [],
            cell;
        var saveNeeded = false;    

        switch (to_solve) {
          case 'letter':
            if (this.selected_cell) {
              my_cells = [this.selected_cell];
            }
            break;
          case 'word':
            if (this.selected_word) {
              for (let coord of this.selected_word.cells) {
                const c = this.selected_word.getCellByCoordinates(coord);
                if (c) {
                  my_cells.push(c);
                }
              }
            }
            break;
          case 'puzzle':
            for (let x in this.cells) {
              for (let y in this.cells[x]) {
                my_cells.push(this.cells[x][y]);
              }
            }
            break;
        }

        // Expand autofill cells (if needed)
        /*
        if (this.is_autofill) {
          const extra_cells = [];
          for (let c of my_cells) {
            const num = c.number;
            if (num != null) {
              const others = this.number_to_cells[num] || [];
              for (let oc of others) {
                const linkedCell = this.cells[oc.x][oc.y];
                if (linkedCell && !my_cells.includes(linkedCell)) {
                  extra_cells.push(linkedCell);
                }
              }
            }
          }
          my_cells = my_cells.concat(extra_cells);
        }
        */

        for (let c of my_cells) {
          if (reveal_or_check !== 'clear' && !c.solution) {
            continue;
          }

          if (reveal_or_check === 'clear') {
            if (c.fixed) continue; // will never happen
            // CLEAR
            this.updateCell(c, {
              letter: '',
              checked: false,
              revealed: false
            });
            if (this.diagramless_mode) {
              this.updateCell(c, {
                type: null, // clear black squares too
                empty: false
              });
            }
          } else if (reveal_or_check === 'reveal') {
            if (this.diagramless_mode) {
              if (c.solution === '#') {
                this.updateCell(c, {
                  type: 'block',
                  empty: true,
                  letter: ''
                });
              } else {
                this.updateCell(c, {
                  type: null,
                  empty: false,
                  letter: c.solution
                });
              }
              this.updateCell(c, {
                checked: false,
                revealed: false
              });
            } else { // revealed std puzzle
              // ✅ SAFEGUARD for normal puzzles: don't show "#" as a letter
              if (c.solution === '#') {
                this.updateCell(c, {
                  letter: '',
                  revealed: false,
                  checked: false
                });
              } else {
                if ( (c.letter != c.solution) && !skipCheat ) { this.setCheated(c.x,c.y); }
                this.updateCell(c, {
                  letter: c.solution,
                  revealed: true,
                  checked: false
                });
                saveNeeded = true;
                // advance :
                const next_cell = this.selected_word.getNextCell(c.x, c.y);
                this.setActiveCell(next_cell);
              }
            }
          } else if (reveal_or_check === 'check') {
            if (this.diagramless_mode) {
              if (c.type === 'block') {
                // If the user placed a black square
                this.updateCell(c, {
                  checked: c.solution != '#' // Mark wrong if not supposed to be a black square
                });
              } else if (c.letter) {
                // User typed something — check the letter
                this.updateCell(c, {
                  checked: !isCorrect(c.letter, c.solution)
                });
              } else {
                // Empty white square — leave unchecked
                this.updateCell(c, {
                  checked: false
                });
              }
            } else {
              // Regular crossword
              if (c.letter) {
		        const ckd = !isCorrect(c.letter, c.solution);
                this.updateCell(c, {
                  checked: ckd
                });
                if (ckd) { this.setError(c.x,c.y) } // c.checked is : NOT correct entry
                saveNeeded = true; 
              } else {
                this.updateCell(c, {
                  checked: false
                });
              }
            }
          }
        }
        if (saveNeeded) { this.saveAndUpdateStats(); }

        // After mass-reveal or clear, renumber
        if (reveal_or_check === 'reveal' && this.diagramless_mode) {
          this.renumberGrid();
        }
        if (reveal_or_check === 'clear' && this.diagramless_mode) {
          this.renumberGrid();
        }

        this.showCurrentWordStateAsString(this.selected_word);

        if (reveal_or_check === 'reveal') {
          this.checkIfSolved(false);
        }

        if (reveal_or_check === 'clear') {
          this.stat_errors = {};
          this.stat_cheated = {};
          xw_timer_seconds = 0 ; 
          this.saveAndUpdateStats();
        }

        if (!IS_MOBILE) {
          this.hidden_input.focus();
        }
      }

      async printPuzzle(e) {
        // fill JSXW
        this.fillJsXw();
        try {
          let doc = await this.jsxw.toPDF();
          doc.autoPrint();
          // open in a new tab and trigger print dialog
          const blobUrl = doc.output("bloburl");
          window.open(blobUrl, "_blank");
        } catch (err) {
          console.error("PDF generation failed:", err);
        }
      }

      saveAsIpuz(e) {
        console.log(e);
        const json = window.ipuz; // this should be a JSON *string*

        // Create a Blob from the text
        const blob = new Blob([json], { type: "application/json" });

        // Create a temporary <a> element
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");

        a.href = url;
        // Try to sanitize the title for a filename
        let filename1 = this.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        if (!filename1) {
          // if this didn't work, revert to just "puzzle"
          filename1 = 'puzzle';
        }
        const filename = filename1 + '.ipuz';
        a.download = filename; // filename for the dialog

        // Trigger a click
        a.click();

        // Cleanup
        URL.revokeObjectURL(url);
      }


      toggleTimer(e) {
        var display_seconds, display_minutes;
        var timer_btn = this.timer_button;
        if (e) e.stopPropagation();

        function add() {
            xw_timer_seconds++;

            const h = Math.floor(xw_timer_seconds / 3600);
            const m = Math.floor((xw_timer_seconds % 3600) / 60);
            const s = xw_timer_seconds % 60;

            // Converts number to string and pads with '0' if length is less than 2
            const mm = String(m).padStart(2, '0');
            const ss = String(s).padStart(2, '0');
            
            var display = h > 0 ? `${h}:${mm}:${ss}`: `${mm}:${ss}`; 
            timer_btn.html(display);
            timer();
        }

        function timer() {
          xw_timer = setTimeout(add, 1000);
        }

        if (this.timer_running) {
          // Stop the timer
          clearTimeout(xw_timer);
          timer_btn.removeClass('running');
          timer_btn.addClass('paused');
          this.timer_running = false;
          if (!IS_MOBILE) {
            this.hidden_input.focus();
          }
        } else {
          // Start the timer
          timer_btn.removeClass('paused');
          this.timer_running = true;
          timer_btn.addClass('running');
          if (!IS_MOBILE) {
            this.hidden_input.focus();
          }
          timer();
        }
      }

      styleClues() {
       // Update all clues in the sidebar
        this.clues_holder.find('.cw-clue').each((i, el) => {
          const $el = $(el);
          const clue = $el.data('clue');
          this.updateClueAppearance(clue, $el);
        });
      }

      updateClueAppearance(clue, $el) {
        if (!clue) return;

        // Use provided $el or look it up in the DOM using unique identifying info
        const clueEl = $el || $(document).find(`.cw-clue.word-${clue.word}[data-number="${clue.number}"]`);

        // We specifically target the clue-text span to avoid graying out the clue number
        const textEl = clueEl.hasClass('cw-clue-text') ? clueEl : clueEl.find('.cw-clue-text');

        const groupId = clueEl.data('clues');
        const group = this.clueGroups.find(g => g.id === groupId);

        if (!this.config.gray_completed_clues && (!group || !group.isFake) && !this.fakeclues) {
          // Reset clue styling if the setting is turned off and this is not a fake clue context
          textEl.css({
            "text-decoration": "",
            "color": ""
          });
          return;
        }

        // Determine if it should be gray based on fakeclues context or word fill state
        let shouldGray = false;
        if (this.fakeclues || (group && group.isFake)) {
          shouldGray = Boolean(clue.fakeClueCompleted);
        } else if (clue.word && this.words[clue.word]) {
          shouldGray = this.words[clue.word].isFilled();
        }

        textEl.css({
          "text-decoration": "",
          "color": shouldGray ? "#aaa" : ""
        });
      }

      updateCell(cell, properties) {
        Object.assign(cell, properties);
        this.adjustCell(cell);
        this.styleClues();
      }

      setSelectedCell(new_cell) {
        const prev_cell = this.selected_cell;
        if (prev_cell === new_cell) {
          return;
        }
        this.selected_cell = new_cell;
        for (const cell of [prev_cell, new_cell]) {
          if (!cell) {
            continue;
          }
          const number = cell.number || cell.top_right_number;
          const linked_cells = this.number_to_cells[number] ?? [cell];
          for (const linked_cell of linked_cells) {
            this.adjustCell(linked_cell);
          }
        }
        this.adjustChevron();
      }

      setSelectedWord(new_word) {
        const prev_word = this.selected_word;
        if (prev_word === new_word) {
          return;
        }
        this.selected_word = new_word;
        for (const word of [prev_word, new_word]) {
          if (!word) {
            continue;
          }
          for (const coord of word.cells) {
            this.adjustCell(word.getCellByCoordinates(coord));
          }
        }
      }
    }

    // CluesGroup stores clues and map of words
    class CluesGroup {
      constructor(crossword, data) {
        this.id = '';
        this.title = '';
        this.clues = [];
        this.clues_container = null;
        this.words_ids = [];
        this.crossword = crossword;
        if (data) {
          if (
            data.hasOwnProperty('id') &&
            data.hasOwnProperty('title') &&
            data.hasOwnProperty('clues') &&
            data.hasOwnProperty('words_ids')
          ) {
            this.id = data.id;
            this.title = data.title;
            this.clues = data.clues;
            this.words_ids = data.words_ids;
          } else {
            load_error = true;
          }
        }
      }

      getFirstWord() {
        if (this.words_ids.length) {
          return this.crossword.words[this.words_ids[0]];
        }
        return null;
      }

      getLastWord() {
        if (this.words_ids.length) {
          return this.crossword.words[
            this.words_ids[this.words_ids.length - 1]
          ];
        }
        return null;
      }

      // gets word which has cell with specified coordinates
      getMatchingWord(x, y, change_word = false) {
        var i,
          word_id,
          word,
          words = [];
        for (i = 0;
          (word_id = this.words_ids[i]); i++) {
          word = this.crossword.words.hasOwnProperty(word_id) ?
            this.crossword.words[word_id] :
            null;
          if (word && word.cells.indexOf(`${x}-${y}`) >= 0) {
            words.push(word);
          }
        }
        if (words.length == 1) {
          return words[0];
        } else if (words.length == 0) {
          return null;
        } else {
          // with more than one word we look for one
          // that's either current or not
          var finding_word = false;
          for (i = 0; i < words.length; i++) {
            word = words[i];
            if (change_word) {
              if (
                this.crossword.selected_word &&
                word.id == this.crossword.selected_word.id
              ) {
                finding_word = true;
              } else if (finding_word) {
                return word;
              }
            } else {
              if (
                this.crossword.selected_word &&
                word.id == this.crossword.selected_word.id
              ) {
                return word;
              }
            }
          }

          // if we didn't match a word in the above
          // just return the first one
          return words[0];
        }
        return null;
      }

      // in clues list, marks clue for word that has cell with given coordinates
      markActive(x, y, is_passive, fakeclues = false) {
        // don't mark anything as active if fake clues
        if (fakeclues || this.crossword.diagramless_mode) {
          return;
        }
        var classname = is_passive ? 'passive' : 'active',
          word = this.getMatchingWord(x, y),
          clue_el,
          clue_position,
          clue_height;
        this.clues_container.find('div.cw-clue.active').removeClass('active');
        this.clues_container.find('div.cw-clue.passive').removeClass('passive');
        if (word) {
          const clue_el = this.clues_container.find(
            'div.cw-clue.word-' + word.id
          );
          clue_el.addClass(classname);
          const clueRect = clue_el.get(0).getBoundingClientRect();

          const scrollContainer = clue_el.closest('.cw-clues-items');
          const scrollRect = scrollContainer.get(0).getBoundingClientRect();

          if (clueRect.top < scrollRect.top) {
            scrollContainer.stop().animate({
                scrollTop: scrollContainer.scrollTop() - (scrollRect.top - clueRect.top),
              },
              150
            );
          } else if (clueRect.bottom > scrollRect.bottom) {
            scrollContainer.stop().animate({
                scrollTop: scrollContainer.scrollTop() +
                  (clueRect.bottom - scrollRect.bottom),
              },
              150
            );
          }
        }
      }

      // returns word next to given
      getNextWord(word) {
        var next_word = null,
          index = this.words_ids.indexOf(word.id);
        if (index < this.words_ids.length - 1) {
          next_word = this.crossword.words[this.words_ids[index + 1]];
        }
        return next_word;
      }

      // returns word previous to given
      getPreviousWord(word) {
        var prev_word = null,
          index = this.words_ids.indexOf(word.id);
        if (index > 0) {
          prev_word = this.crossword.words[this.words_ids[index - 1]];
        }
        return prev_word;
      }
    }

    // Word constructor
    class Word {
      constructor(crossword, data) {
        this.id = '';
        this.dir = '';
        this.cell_ranges = [];
        this.cells = [];
        this.clue = {};
        this.refs_raw = [];
        this.crossword = crossword;
        if (data) {
          if (
            data.hasOwnProperty('id') &&
            data.hasOwnProperty('dir') &&
            data.hasOwnProperty('cell_ranges') &&
            data.hasOwnProperty('clue') &&
            data.hasOwnProperty('refs_raw')
          ) {
            this.id = data.id;
            this.dir = data.dir;
            this.cell_ranges = data.cell_ranges;
            this.clue = data.clue;
            //this.refs_raw = data.clue.refs;
            this.parseRanges();
          } else {
            load_error = true;
          }
        }
      }

      // Parses cell ranges and stores cells coordinates as array ['x1-y1', 'x1-y2' ...]
      parseRanges() {
        var i, k, cell_range;
        this.cells = [];
        for (i = 0;
          (cell_range = this.cell_ranges[i]); i++) {
          var split_x = cell_range.x.split('-'),
            split_y = cell_range.y.split('-'),
            x,
            y,
            x_from,
            x_to,
            y_from,
            y_to;

          if (split_x.length > 1) {
            x_from = Number(split_x[0]);
            x_to = Number(split_x[1]);
            y = split_y[0];
            for (
              k = x_from; x_from < x_to ? k <= x_to : k >= x_to; x_from < x_to ? k++ : k--
            ) {
              this.cells.push(`${k}-${y}`);
            }
          } else if (split_y.length > 1) {
            x = split_x[0];
            y_from = Number(split_y[0]);
            y_to = Number(split_y[1]);
            for (
              k = y_from; y_from < y_to ? k <= y_to : k >= y_to; y_from < y_to ? k++ : k--
            ) {
              this.cells.push(`${x}-${k}`);
            }
          } else {
            x = split_x[0];
            y = split_y[0];
            this.cells.push(`${x}-${y}`);
          }
        }
      }

      hasCell(x, y) {
        return this.cells.indexOf(`${x}-${y}`) >= 0;
      }

      // get first empty cell in word
      // if x and y given - get first empty cell after cell with coordinates x,y
      // if there's no empty cell after those coordinates - search from begin
      /*
      check_reveal(to_solve, reveal_or_check, e, skipCheat = false) {
        if (typeof e === 'boolean') {
            skipCheat = e;
            e = null;
        }
      */
      getFirstEmptyCell(x, y, checkedIsEmpty = false) { // if checkedIsEmpty = true : consider checked cell as empty
        if (typeof x === 'boolean') { checkedIsEmpty = x ; x = null ; } // when only 1 param : its checkedIsEmpty
              //
        // Return null if there are no cells in the word
        if (!this.cells || this.cells.length === 0) return null;

        const total = this.cells.length;
        let startIndex = 0;

        if (x != null && y != null) {
          // Find the index of the given coordinates in the word
          const idx = this.cells.indexOf(`${x}-${y}`);
          if (idx >= 0) {
            // Start searching *after* the current cell, wrapping if necessary
            startIndex = (idx + 1) % total;
          }
        }

        // Loop through every cell once, wrapping automatically using modulo
        for (let i = 0; i < total; i++) {
          // Compute index with wraparound
          const index = (startIndex + i) % total;

          // Get the cell coordinates and the corresponding cell object
          const coordinates = this.cells[index];
          const cell = this.getCellByCoordinates(coordinates);

          // Return the first cell without a letter
          if (cell && (!cell.letter || (checkedIsEmpty && cell.checked)) ) {
            return cell;
          }
        }

        // If we reach here, all cells are filled — no empty cell found
        return null;
      }

      // Determine if the word is filled
      isFilled() {
        return this.getFirstEmptyCell() === null;
      }

      getFirstCell() {
        var cell = null;
        if (this.cells.length) {
          cell = this.getCellByCoordinates(this.cells[0]);
        }
        return cell;
      }

      getLastCell() {
        var cell = null;
        if (this.cells.length) {
          cell = this.getCellByCoordinates(this.cells[this.cells.length - 1]);
        }
        return cell;
      }

      getNextCell(x, y) {
        var index = this.cells.indexOf(`${x}-${y}`),
          cell = null;
        if (index < this.cells.length - 1) {
          cell = this.getCellByCoordinates(this.cells[index + 1]);
        }
        return cell;
      }

      getPreviousCell(x, y) {
        var index = this.cells.indexOf(`${x}-${y}`),
          cell = null;
        if (index > 0) {
          cell = this.getCellByCoordinates(this.cells[index - 1]);
        }

        return cell;
      }

      getCellByCoordinates(txt_coordinates) {
        var split, x, y, cell;
        split = txt_coordinates.split('-');
        if (split.length === 2) {
          x = split[0];
          y = split[1];
          cell = this.crossword.getCell(x, y);
          if (cell) {
            return cell;
          }
        }
        return null;
      }

      solve() {
        var i, coordinates, cell;
        for (i = 0;
          (coordinates = this.cells[i]); i++) {
          cell = this.getCellByCoordinates(coordinates);
          if (cell) {
            this.crossword.updateCell(cell, { letter: cell.solution });
          }
        }
      }
    }

    if (typeof define === 'function' && define.amd) {
      define('CrosswordNexus', [], function() {
        return CrosswordNexus;
      });
    }

    if (registerGlobal) {
      window.CrosswordNexus = CrosswordNexus;
    }

    return CrosswordNexus;
  }
);
