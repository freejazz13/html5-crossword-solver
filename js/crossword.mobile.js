/**
Copyright (c) 2025, Crossword Nexus & Crossweird LLC
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
**/

/*
- structure of the container hierarchy with new list view container:
  .cw-grid-wrapper                    ← outer flex column container
    └─ .cw-grid-clue-wrapper          ← inner flex row: grid + optional side clues
         ├─ <canvas>                   ← the crossword grid
         └─ .cw-mobile-clues-side      ← side clue panel (hidden on phones <767px)
    └─ #cw-clue-list-view             ← alternate "list view" SVG (toggled, hidden by default)
         └─ .cw-clue-list-group            (one per ACROSS / DOWN)
              ├─ .cw-clue-list-group-title  ← sticky header, z-index: 1 ; values : "ACROSS" OR "DOWN"
              └─ .cw-clue-list-item[data-word-id][data-group-id]   (one per clue)
                   ├─ .cw-clue-list-clue-text
                   │    ├─ <span.cw-clue-number>  ← bold number
                   │    └─ <span>  ← clue text
                   └─ <svg.cw-clue-word-svg>  ← horizontal cell row
                        ├─ <rect data-cx data-cy>  ← background fill
                        └─ <text data-cx data-cy>  ← letter


  - .cw-grid-clue-wrapper is a flex-row holding the canvas and the side clue panel side-by-side. On tablets/desktop it shows both; on phones (<767px) the side panel is hidden.
  - #cw-clue-list-view sits outside .cw-grid-clue-wrapper, as a sibling inside .cw-grid-wrapper. It's an SVG-based alternate view toggled by the "List" button — when active, cw-grid-clue-wrapper is hidden and this takes over.
*/

var gCrossword;
let isAltKeyboard = false;
//var v_autocheck;

$(document).ready(function () {
  let initialWindowHeight = window.innerHeight;
  setCSSViewportHeight();
  // Listen to visualViewport resize events
  window.visualViewport?.addEventListener('resize', () => {
    setCSSViewportHeight();
    detectKeyboardAndResize(); // you already have this function
  });

  // Listen to orientation changes
  window.addEventListener('orientationchange', () => {
    setTimeout(() => {
      if (gCrossword?.syncTopTextWidth) {
        gCrossword.syncTopTextWidth();
      }
      setCSSViewportHeight();
    }, 300);
  });

  const isMobile = CrosswordShared.isMobileDevice();
  const crosswordRoot = document.querySelector('.crossword');

  if (isMobile && crosswordRoot) {
    crosswordRoot.classList.add('mobile');
    document.body.classList.add('mobile-mode');

    // Viewport handlers
    window.visualViewport?.addEventListener('resize', detectKeyboardAndResize);
    window.addEventListener('resize', detectKeyboardAndResize);
    window.visualViewport?.addEventListener('resize', () => {
      setCSSViewportHeight();
      detectKeyboardAndResize();
    });

    window.addEventListener('orientationchange', () => {
      setTimeout(() => {
        setCSSViewportHeight();
      }, 300);
    });
  }

  function setCSSViewportHeight() {
    if (!window.visualViewport) return;

    const vh = window.visualViewport.height + window.visualViewport.offsetTop;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
  }

  function rebuildKeyboard() {
    const wrapper = document.querySelector('.keyboard-wrapper-placeholder');
    const oldKeyboard = wrapper.querySelector('#custom-keyboard');
    if (oldKeyboard) oldKeyboard.remove();

    const newKeyboard = createCustomKeyboard();

    wrapper.appendChild(newKeyboard);
    wrapper.style.height = `${newKeyboard.offsetHeight}px`;
    window.addEventListener('resize', syncKb);
  // ── Sync keyboard height to placeholder ──
  function syncKb() {
    const keyboard = document.getElementById('custom-keyboard');
    const h = keyboard.getBoundingClientRect().height;
    document.getElementById('placeholder').style.height = h + 'px';
  }

    /* // Reattach Rebus key
    newKeyboard.querySelector('.cw-key-rebus')?.addEventListener('click', () => {
      const rebusEntry = prompt('Rebus entry', '');
      if (rebusEntry) {
        gCrossword.hiddenInputChanged(rebusEntry.toUpperCase());
      }
    });

    newKeyboard.querySelector('.cw-key-left')?.addEventListener('click', () => {
      const skipFilled = gCrossword.config?.tab_key === 'tab_skip';
      gCrossword.moveToNextWord(true, skipFilled); // ← previous word
    });

    newKeyboard.querySelector('.cw-key-right')?.addEventListener('click', () => {
      const skipFilled = gCrossword.config?.tab_key === 'tab_skip';
      gCrossword.moveToNextWord(false, skipFilled); // → next word
    });*/
  }

  function rebuildKeyboardAndPositionDrawer() {
    rebuildKeyboard();
  }

  function detectKeyboardAndResize() {
    setTimeout(() => {
      const currentHeight = window.innerHeight;
      const keyboardOpen = currentHeight < initialWindowHeight - 150;

      document.body.classList.toggle('keyboard-visible', keyboardOpen);
    }, 50);
  }

  // Load puzzle and optional config from URL
  const params = CrosswordShared.getCrosswordParams();

  gCrossword = CrosswordNexus.createCrossword($('div.crossword'), params);
  if (gCrossword?.syncTopTextWidth) {
    window.gCrossword.syncTopTextWidth = gCrossword.syncTopTextWidth.bind(gCrossword);
  }

  if (isMobile && crosswordRoot) {
    // ── Clue List View helpers ──────────────────────────────────────
    let clueListViewActive = false;

    function buildClueListView() {
      const container = document.getElementById('cw-clue-list-view');
      if (!container || !gCrossword?.clueGroups) return;
      const initialWidth = document.querySelector('.cw-grid-clue-wrapper')?.offsetWidth
                        ?? container.parentElement?.offsetWidth
                        ?? 0;
      // 2*4 = CSS padding l/r 
      //  1 = stroke-width
      const LIST_CELL_SIZE = Math.ceil((initialWidth - (2 * 4) )/ gCrossword.grid_width) - 1 ;
      gCrossword.listCellSize = LIST_CELL_SIZE; // to be used in updateClueListView
            
      container.innerHTML = '';
      const ns = 'http://www.w3.org/2000/svg';

      gCrossword.clueGroups.forEach(group => {
        const groupEl = document.createElement('div');
        groupEl.className = 'cw-clue-list-group';

        const titleEl = document.createElement('div');
        titleEl.className = 'cw-clue-list-group-title';
        titleEl.textContent = group.title;
        groupEl.appendChild(titleEl);

        group.clues.forEach(clue => {
          const word = gCrossword.words[clue.word];
          if (!word) return;

          const item = document.createElement('div');
          item.className = 'cw-clue-list-item';
          item.dataset.wordId = clue.word;
          item.dataset.groupId = group.id;

          // Clue text row
          const textEl = document.createElement('div');
          textEl.className = 'cw-clue-list-clue-text';
          const numSpan = document.createElement('span');
          numSpan.className = 'cw-clue-number';
          numSpan.textContent = clue.number;
          const txtSpan = document.createElement('span');
          txtSpan.textContent = clue.text;
          textEl.appendChild(numSpan);
          textEl.appendChild(txtSpan);
          item.appendChild(textEl);

          // SVG word cells (always rendered as a horizontal row)
          const n = word.cells.length;
          const svgW = n * LIST_CELL_SIZE;
          const svg = document.createElementNS(ns, 'svg');
          //svg.setAttribute('viewBox', `0 0 ${svgW} ${LIST_CELL_SIZE}`);
          svg.setAttribute('viewBox', `-0.5 -0.5 ${svgW + 1} ${LIST_CELL_SIZE + 1}`);
          svg.setAttribute('preserveAspectRatio', 'xMinYMin meet');
          svg.setAttribute('width', svgW);
          svg.setAttribute('height', LIST_CELL_SIZE);
          svg.classList.add('cw-clue-word-svg');
          svg.dataset.wordId = clue.word; // will add data-word-id="n" where n is word number

          word.cells.forEach((cellKey, i) => {
            const [cx, cy] = cellKey.split('-').map(Number);
            const cell = gCrossword.cells[cx]?.[cy];
            if (!cell) return;
            const px = i * LIST_CELL_SIZE;
            const fill = cell.type === 'block'
              ? 'var(--grid-block-color)'
              : (cell.color || 'var(--grid-none-color)');

            const rect = document.createElementNS(ns, 'rect');
            rect.setAttribute('x', px);
            rect.setAttribute('y', 0);
            rect.setAttribute('width', LIST_CELL_SIZE);
            rect.setAttribute('height', LIST_CELL_SIZE);
            rect.setAttribute('fill', fill);
            rect.setAttribute('stroke', 'var(--grid-stroke-color)');
            rect.setAttribute('stroke-width', '1');
            rect.setAttribute('data-cx', cx);
            rect.setAttribute('data-cy', cy);
            rect.setAttribute('class', 'cw-cell');
            svg.appendChild(rect);

            const txt = document.createElementNS(ns, 'text');
            txt.setAttribute('x', px + LIST_CELL_SIZE / 2);
            txt.setAttribute('y', LIST_CELL_SIZE * 0.78);
            txt.setAttribute('text-anchor', 'middle');
            txt.setAttribute('font-family', 'Arial, sans-serif');
            txt.setAttribute('font-size', LIST_CELL_SIZE * 0.62);
            txt.setAttribute('fill', 'var(--grid-none-text-color)');
            txt.setAttribute('data-cx', cx);
            txt.setAttribute('data-cy', cy);
            rect.setAttribute('class', 'cw-cell-letter');
            txt.textContent = cell.letter || '';
            svg.appendChild(txt);
          });

          item.appendChild(svg);

          //item is 'cw-clue-list-item' 
          item.addEventListener('click', () => {
            const w = gCrossword.words[item.dataset.wordId];
            if (!w) return;
            // true => consider checked as empty, click event isnt on cell, so we'll position on wrong cell directly
            const c = w.getFirstEmptyCell(true) || w.getFirstCell();
            if (!c) return;
            gCrossword.setActiveWord(w);
            gCrossword.setActiveCell(c);
            if (gCrossword.clueGroups[gCrossword.activeClueGroupIndex]?.id !== item.dataset.groupId) {
              gCrossword.changeActiveClues();
            }
            //gCrossword.renderCells();
          });

          groupEl.appendChild(item);
        });
        container.appendChild(groupEl);
      });
    }

          
    function updateClueListView() {
        if (!clueListViewActive) return;
        const listView = document.getElementById('cw-clue-list-view');
        if (!listView) return;
    
        // 1. First, sync all Rects and Text
        listView.querySelectorAll('rect[data-cx]').forEach(rect => {
            const cx = rect.getAttribute('data-cx');
            const cy = rect.getAttribute('data-cy');
            const gridCell = document.querySelector(`rect.cw-cell[data-x="${cx}"][data-y="${cy}"]`);
            if (gridCell) {
                // 1. Sync visual attributes
                const attrs = ['fill', 'stroke'];
                attrs.forEach(attr => rect.setAttribute(attr, gridCell.getAttribute(attr)));
                // 2. Sync classes (crucial for 'selected' and 'linked' states)
                rect.className.baseVal = gridCell.className.baseVal;
            }
        });
    
        listView.querySelectorAll('text[data-cx]').forEach(txt => {
            const cx = txt.getAttribute('data-cx');
            const cy = txt.getAttribute('data-cy');
            const cell = gCrossword.cells[cx]?.[cy];
            if (cell) txt.textContent = cell.letter || '';
        });
    
        // NOW draw the slashes on top of EVERYTHING
        listView.querySelectorAll('rect[data-cx]').forEach(rect => {
            const cx = rect.getAttribute('data-cx');
            const cy = rect.getAttribute('data-cy');
            const cell = gCrossword.cells[cx]?.[cy];
            //const wordId = rect.parentElement.getAttribute('data-word-id');
            //const svg = document.querySelector(`.cw-clue-word-svg[data-word-id="${wordId}"]`);
            const svg = rect.closest('svg');
            const wordId = svg.getAttribute('data-word-id');
            const ns = 'http://www.w3.org/2000/svg';
    
            // Remove existing slash for this specific cell
            const slashSelector = `line[data-word-id="${wordId}"][data-cx="${cx}"][data-cy="${cy}"]`;
            const slashExist = svg.querySelector(slashSelector);
            if (slashExist) { slashExist.remove(); }
    
            if (cell && cell.checked) {
                const slash = document.createElementNS(ns, 'line');
                const x = parseFloat(rect.getAttribute('x'));
                const y = parseFloat(rect.getAttribute('y'));
                const w = parseFloat(rect.getAttribute('width'));
                const h = parseFloat(rect.getAttribute('height'));
    
                slash.setAttribute('x1', x + 2);
                slash.setAttribute('y1', y + 2);
                slash.setAttribute('x2', x + w - 2);
                slash.setAttribute('y2', y + h - 2);
                slash.setAttribute('stroke-linecap', 'round');
                slash.setAttribute('stroke', 'var(--grid-none-text-color)');
                slash.setAttribute('stroke-width', 2);
                
                // Add identifiers so we can find/remove it later
                slash.dataset.wordId = wordId;
                slash.dataset.cx = cx;
                slash.dataset.cy = cy;
    
                // Appending last ensures it is at the top of the Z-stack
                svg.appendChild(slash);
            }
        });
    
        // 3. Highlight active word
        const activeId = String(gCrossword.selected_word?.id ?? '');
        listView.querySelectorAll('.cw-clue-list-item').forEach(item => {
            item.classList.toggle('cw-clue-list-active', item.dataset.wordId === activeId);
        });
    }

    function toggleClueListView() {
      clueListViewActive = !clueListViewActive;
      const gridWrapper = document.querySelector('.cw-grid-clue-wrapper');
      const listView = document.getElementById('cw-clue-list-view');
      const btn = document.getElementById('btn-clue-list-toggle');
      if (!gridWrapper || !listView) return;

      if (clueListViewActive) {
        gridWrapper.style.display = 'none';
        listView.classList.add('active');
        if (btn) btn.textContent = 'Grid';
        updateClueListView();
        const activeItem = listView.querySelector('.cw-clue-list-active');
        if (activeItem) activeItem.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } else {
        gridWrapper.style.display = '';
        listView.classList.remove('active');
        if (btn) btn.textContent = 'List';
        gCrossword.setActiveWord(gCrossword.selected_word); //resize text correctly
        gCrossword.renderCells();
      }
    }
    // ── End Clue List View ──────────────────────────────────────────

    const tryWrapLayout = () => {
      let timer;
      const canvas = document.querySelector('.cw-canvas');
      const buttons = document.querySelector('.cw-buttons-holder');
      //const dhi = document.querySelector('#drawer-handle-infos');
      if (buttons && buttons.children.length) {
        const allButtons = Array.from(buttons.children);

        // Match by text content – you can refine this to use classes if needed
        const file = allButtons.find(btn => btn.textContent.includes('Crossword'));
        const check = allButtons.find(btn => btn.textContent.includes('Check'));
        const reveal = allButtons.find(btn => btn.textContent.includes('Reveal'));
        const settings = allButtons.find(btn => btn.textContent.includes('Settings'));
        timer = allButtons.find(btn => btn.textContent.match(/[\d:]+/)); // crude match for timer

        // Only reflow if all buttons were found
        if (file && check && reveal && settings && timer) {

          const row_ta = document.createElement('div');
          row_ta.className = 'cw-buttons-row';
          const b0 = `<button type="button" id="fake-btn-tit-auth" class="cw-button cw-settings-button">
                    TITLE AUTHOR
                   </button>`;
          row_ta.innerHTML = b0;

          const row0 = document.createElement('div');
          row0.className = 'cw-buttons-row';
          const b = `<button type="button" id="fake-btn-stats" class="cw-button cw-settings-button">
                    STATS
                   </button>`;
          row0.innerHTML = b;

          const row1 = document.createElement('div');
          row1.className = 'cw-buttons-row';
          const listBtn = document.createElement('button');
          listBtn.type = 'button';
          listBtn.id = 'btn-clue-list-toggle';
          listBtn.className = 'cw-button';
          listBtn.textContent = 'List';
          listBtn.addEventListener('click', toggleClueListView);
          row1.append(file, check, reveal, settings, listBtn);

          /*
          const row2 = document.createElement('div');
          row2.className = 'cw-buttons-row';
          row2.append(timer);
          */

          // Clear and re-append
          buttons.innerHTML = '';
          //buttons.append(row_ta,row0, row1, row2);
          buttons.append(row_ta,row0, row1 );

        }
      }
      const content = document.querySelector('.cw-content');
      const clues = document.querySelector('.cw-clues-holder');
      let drawerOpen = false;
      let drawer;
      let touchStartY = null;

      if (!canvas || !buttons || !content || !clues || !clues.querySelector(".cw-clues, .cw-clues-top, .cw-clues-bottom")) {
        return setTimeout(tryWrapLayout, 50);
      }


      // Safe to remove .cw-grid AFTER canvas is grabbed
      const grid = document.querySelector('.cw-grid');
      if (grid) grid.remove();

      // Build wrapper
      const wrapper = document.createElement('div');
      wrapper.className = 'cw-grid-wrapper';

      // Append the canvas (grid)
      wrapper.appendChild(canvas);

      // NEW: Create clues container
      const mobileClues = document.createElement('div');
      mobileClues.className = 'cw-mobile-clues-holder';

      // Move top and bottom clues into this container
      const clueBlocks = Array.from(clues.querySelectorAll(".cw-clues"));

      if (clueBlocks.length) {
        clueBlocks.forEach((block) => mobileClues.appendChild(block));
      }

      // Create container to hold grid + clues side by side
      const gridClueWrapper = document.createElement('div');
      gridClueWrapper.className = 'cw-grid-clue-wrapper';

      // Append the canvas (grid)
      gridClueWrapper.appendChild(canvas);

      // Use the already-declared mobileClues
      mobileClues.className = 'cw-mobile-clues-side'; // update class name for styling

      // Append clues to the right of the grid
      gridClueWrapper.appendChild(mobileClues);

      // Append grid + clues layout into the main wrapper
      wrapper.appendChild(gridClueWrapper);

      // Clue list view container (hidden by default, toggled by List button)
      const clueListEl = document.createElement('div');
      clueListEl.id = 'cw-clue-list-view';
      clueListEl.className = 'cw-clue-list-view';
      wrapper.appendChild(clueListEl);

      // Rebind clue clicks for mobile container
      mobileClues.querySelectorAll('.cw-clue').forEach(el => {
        el.addEventListener('click', (e) => {
          const target = $(e.currentTarget);
          const wordId = target.data('word');
          const word = gCrossword.words[wordId];

          if (!word) return;

          const cell = word.getFirstEmptyCell() || word.getFirstCell();
          if (cell) {
            gCrossword.setActiveWord(word);
            if (gCrossword.clueGroups[gCrossword.activeClueGroupIndex].id !== target.data('clues')) {
              gCrossword.changeActiveClues();
            }
            gCrossword.setActiveCell(cell);

            // ✅ Manually trigger clue highlighting
            gCrossword.clueGroups.forEach(group => {
              // The first param (`isInactive`) is true for all groups except the active one
              const isInactive = group !== gCrossword.clueGroups[gCrossword.activeClueGroupIndex];
              if (typeof group.markActive === 'function') {
                group.markActive(cell.x, cell.y, isInactive, gCrossword.fakeclues);
              }
            });

            gCrossword.renderCells();
          }
        });
      });

      // Create drawer container
      const buttonWrapper = document.createElement('div');
      buttonWrapper.className = 'cw-buttons-drawer';

      // Add drawer to layout before inserting buttons
      wrapper.appendChild(buttonWrapper);

      // THEN move buttons inside the drawer
      buttonWrapper.appendChild(buttons);

      // Create the handle and append
      const handle = document.createElement('div');
      handle.className = 'cw-buttons-handle';

      const bt1 = document.createElement('div');
      bt1.className = 'cw-buttons-row';
      handle.appendChild(bt1);
      const dhi = document.createElement('button');
      dhi.id = 'drawer-handle-infos';
      
      //🔤🅰️
      dhi.className = 'cw-button';
      const tit_auth= '<span class="autocheck-emoji">🅰️</span> • ' + `${gCrossword.title} • ` + `${gCrossword.author}`+ ' • <span class="signal-emoji">📶</span> <span class="sync-emoji">&#8597;&#65039;</span>';
      dhi.innerHTML = `<span>${tit_auth}</span>&nbsp;`;
      if (timer) {
          dhi.appendChild(timer); 
      }
      bt1.appendChild(dhi);

      const htmlString = `
                  <div id="twlm-container" style=" display: flex; align-items: center; width: 100%; background: var(--clue-active-color); position: relative;">
                    <div style="padding-left: 2px; z-index: 2;">
                        <span id="switchListGrid" style="cursor: pointer; user-select: none; font-size: 1em; padding: 4px;">📋</span>
                    </div>
                    <span id="this-word-letters-mobile" style=" position: absolute; left: 50%; transform: translateX(-50%); white-space: nowrap; letter-spacing: 2px; font-weight: bold; z-index: 1; text-align: center; "></span>
                  </div>`;

     // Inject it into your target element
     wrapper.insertAdjacentHTML('beforeend', htmlString);

     // Now find the element in the DOM to add the logic
     const switcher = wrapper.querySelector('#switchListGrid');
     switcher.onclick = (e) => {
                const el = e.currentTarget;
                el.textContent = clueListViewActive ? '📋':'𖣯' ;
                //el.textContent = isGrid ? '📋' : '🔄';
                toggleClueListView();
                };

      wrapper.appendChild(handle);
      wrapper.appendChild(buttonWrapper);

      // Create keyboard wrapper and append
      const keyboardWrapper = document.createElement('div');
      keyboardWrapper.className = 'keyboard-wrapper-placeholder';
      wrapper.appendChild(keyboardWrapper);

      // Insert everything before clues
      content.insertBefore(wrapper, clues);

      // Rebuild keyboard
      rebuildKeyboardAndPositionDrawer();

      // Build clue list view 
      buildClueListView();

      // -----------------------------------------------------------------------------------------------------------------
      // hook real functions:
      //Saves a reference to the original renderCells method, bound to gCrossword so this stays correct when called later.          
      const realRenderCells = gCrossword.renderCells.bind(gCrossword);
      gCrossword.renderCells = function(...a) {
        //Calls the original method, forwarding all arguments unchanged, and captures its return value.
        const r = realRenderCells(...a);
        updateClueListView();
        //Returns the original method's result so callers see no difference in behavior.
        return r;
      };

      const realSetActiveCell = gCrossword.setActiveCell.bind(gCrossword);
      gCrossword.setActiveCell = function(cell) {
        const r = realSetActiveCell(cell);
        updateClueListView();
        return r;
      };

      const realUpdateCell = gCrossword.updateCell.bind(gCrossword);
      gCrossword.updateCell = function(cell, props) {
        const r = realUpdateCell(cell, props);
        if ('letter' in props) updateClueListView();
        return r;
      };
      // -----------------------------------------------------------------------------------------------------------------


      // Drawer toggle logic
      drawer = buttonWrapper;
      drawerOpen = false; // starts visible
      drawer.classList.remove('open'); // make sure it's closed on load
      // Immediately hide the drawer (force rendering to catch transform)
      requestAnimationFrame(() => {
        drawer.classList.remove('open');
      });

      // Click to toggle
      handle.addEventListener('click', () => {
        drawerOpen = !drawerOpen;
        drawer.classList.toggle('open', drawerOpen);
      });

      // Swipe gesture
      touchStartY = null;
      handle.addEventListener('touchstart', (e) => {
        touchStartY = e.touches[0].clientY;
      });
      handle.addEventListener('touchend', (e) => {
        if (touchStartY === null) return;
        const deltaY = touchStartY - e.changedTouches[0].clientY;
        if (deltaY > 30) {
          drawerOpen = true;
        } else if (deltaY < -30) {
          drawer.classList.remove('open');
          drawerOpen = false;
        }
        touchStartY = null;
      });
      setTimeout(() => {
        const firstWord = gCrossword.clueGroups[gCrossword.activeClueGroupIndex].getFirstWord();
        gCrossword.setActiveWord(firstWord);
        gCrossword.setActiveCell(firstWord.getFirstCell());
        gCrossword.renderCells();
        if (gCrossword.v_autocheck) { gCrossword.check_reveal('puzzle', 'check'); }
        // Match the width of the top clue bar to the grid
        setTimeout(() => {
          const gridEl = document.getElementById('cw-puzzle-grid');
          const clueBar = document.querySelector('.cw-top-text-wrapper');
          if (gridEl && clueBar) {
            if (! isMobile) {
                clueBar.style.width = gridEl.getBoundingClientRect().width + 'px';
            } else {            
                clueBar.style.width = '100%';
           }
          }
        }, 100);
      }, 50);
    }; // end tryWrapLayout

    setTimeout(tryWrapLayout, 300);
    //gCrossword.timer_button = document.querySelector('.cw-button-timer');
    //gCrossword.timer_button.addEventListener('click', gCrossword.toggleTimer);
  } // end isMobile
  console.log('Is mobile?', isMobile, 'Classes:', document.querySelector('.crossword')?.className);
  //-------------------------------------------------------------------------------------------------
  // JS pinch-zoom: grid only ────────────────────────────────
  // CSS touch-action is unreliable when JS touches are involved.
  // Instead we intercept ALL touch events at document level,
  // check where the fingers are, and either:
  //   - allow + handle zoom ourselves (fingers on grid)
  //   - block zoom entirely (fingers on keyboard)
  /* The Sequence of Events
    touchstart (Finger 1): You place your first finger. The browser records the coordinates.
    touchstart (Finger 2): You place the second finger. The browser now identifies a multi-touch state.
    touchmove (The Zoom): As you move your fingers apart, hundreds of touchmove events fire per second. 
    The browser calculates the change in distance between the two sets of coordinates to determine the Scale Factor.
    touchend: When you lift your fingers, the final scale is set.
 */
  //const zoom_container = this.root.find('#cw-zoom-container');
  const zoomContainer = document.getElementById('cw-zoom-container');



  gCrossword.currentScale = 1;
  let startScale = 1;
  let startDist = null;
  let pinchOnGrid = false;

  // Translation state
  let tx = 0, ty = 0;          // current translation
  let startTx = 0, startTy = 0; // translation at pan start
  let panStartX = 0, panStartY = 0; // finger position at pan start
  let isPanning = false;
  


  function applyTransform() {
    zoomContainer.style.transform = 'translate(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px) scale(' + gCrossword.currentScale.toFixed(3) + ')';
    //console.log('scale: ' + gCrossword.currentScale.toFixed(2) + '×  tx:' + Math.round(tx) + ' ty:' + Math.round(ty));
  }

  function clampTranslation() {
    const initialWidth  = zoomContainer.offsetWidth; // always gives original dims 
    const initialHeight = zoomContainer.offsetHeight;

    const zc_style = window.getComputedStyle(zoomContainer);
    const mtop = parseFloat(zc_style.marginTop) || 45;
    const canh = document.querySelector('div.cw-canvas');
    // "canvas" dims : usable screen rect for grid and top text:
    const canRect = canh.getBoundingClientRect();
    const maxH = canRect.height -  parseInt(mtop, 45);
    const maxW = canRect.width;
    // not working , doesnt stay constant:
    //const initialZoomRect = zoomContainer.getBoundingClientRect();
    //const initialWidth  = initialZoomRect.width;
    //const initialHeight = initialZoomRect.height;

    // Don't allow panning when not zoomed or reduced, or zoomed not enough to fit screen width (maxW)
    if (gCrossword.currentScale <= 1 || 
        (gCrossword.currentScale * initialWidth < maxW && gCrossword.currentScale * initialHeight < maxH))
      { tx = 0; ty = 0; return; }

    // Compute max allowed translation so grid doesn't leave the zone
    // excess initial empty space to subtract to max translation if grid didnt fill the space initially 
    const xSTx = ((maxW - initialWidth) / 2 > 2) ? (maxW - initialWidth) / 2 : 0.0;
    const xSTy = ((maxH - initialHeight) / 2 > 2) ? (maxH - initialHeight) / 2 : 0.0;

    const TmaxX = (initialWidth * (gCrossword.currentScale - 1)) / 2 - xSTx ; // delta = (scale * w - w) so each side grows : delta/2
    const TmaxY = (initialHeight * (gCrossword.currentScale - 1)) / 2 - xSTy;
    tx = Math.min(Math.max(tx, -TmaxX), TmaxX); // "compressed" way of ensuring  -TmaxX <= tx <= TmaxX
    ty = Math.min(Math.max(ty, -TmaxY), TmaxY);
    console.log('maxW='+ maxW + ' initialWidth='+initialWidth +' maxH='+maxH+'  initialHeight='+initialHeight)
    console.log('scale: ' + gCrossword.currentScale.toFixed(2) + 'tx:' + Math.round(tx) + ' ty:' + Math.round(ty)+ ' MaxX:' + Math.round(TmaxX) + ' MaxY:' + Math.round(TmaxY));
  }

  function touchDist(t1, t2) {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function onKeyboard(touch) {
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const keyboard = document.getElementById('custom-keyboard');
    return el && keyboard.contains(el);
  }

  function onGrid(touch) {
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const grid = document.getElementById('cw-zoom-container');
    return el && grid.contains(el);
  }

  /*
    When you add an event listener, the browser doesn't know in advance whether your handler will call preventDefault() or not. So it waits for your JS to finish before it performs the default action (scroll, zoom, etc.) — this causes jank.
    passive: true is a promise to the browser that you will never call preventDefault() inside that handler. The browser can then perform the default action immediately, in parallel with your JS, without waiting. Smoother performance.
    passive: false is the default — browser waits for your JS before acting.
    The constraint: if you declare passive: true and then call preventDefault() anyway, the browser ignores the preventDefault() and prints a console warning.
    That's why all three e.preventDefault() must be removed from touchstart before switching it to passive: true.
    touchmove stays passive: false because you still need preventDefault() there to block the browser zoom during pinch.
  */
  document.addEventListener('touchstart', function (e) { // passive true:browser waits
    console.log('touchstart');
    if (e.touches.length === 2) {
      // Stop any panning
      isPanning = false;
      const onKb = onKeyboard(e.touches[0]) || onKeyboard(e.touches[1]);
      if (onKb) {
        pinchOnGrid = false;
        //e.preventDefault();
      } else if (onGrid(e.touches[0])) {
        pinchOnGrid = true;
        startDist = touchDist(e.touches[0], e.touches[1]);
        startScale = gCrossword.currentScale;
        //e.preventDefault();
      }
    } else if (e.touches.length === 1) {
      pinchOnGrid = false;
      // Only pan when zoomed in, and finger not on keyboard
      if (gCrossword.currentScale > 1 && !onKeyboard(e.touches[0])) {
        isPanning = true;
        panStartX = e.touches[0].clientX;
        panStartY = e.touches[0].clientY;
        startTx = tx;
        startTy = ty;
        //e.preventDefault();
      } else {
        isPanning = false;
      }
    }
  }, { passive: true });

  document.addEventListener('touchmove', function (e) {
    console.log('touchmove');
    if (e.touches.length === 2) {
      e.preventDefault();
      isPanning = false;
      if (pinchOnGrid && startDist !== null) {
        const d = touchDist(e.touches[0], e.touches[1]);
        let s = startScale * (d / startDist);
        if (s >= 1.0) {
                s = Math.min(s, 3);
        } else {        
                s = Math.max(0.5, s);
        }
        gCrossword.currentScale = s;
        //clampTranslation();
        applyTransform();
      }
    } else if (e.touches.length === 1 && isPanning) {
      e.preventDefault();
      tx = startTx + (e.touches[0].clientX - panStartX);
      ty = startTy + (e.touches[0].clientY - panStartY);
      clampTranslation();
      applyTransform();
    }
  }, { passive: false });

  document.addEventListener('touchend', function (e) {
    console.log('touchend');
    if (e.touches.length < 2) {
      startDist = null;
      pinchOnGrid = false;
      //gCrossword.renderCells();
    }
    if (e.touches.length === 0) {
      isPanning = false;
      // recenter if scale snaps from > 1 to < 1 or reverse:
      if (startScale > 1.0 && gCrossword.currentScale <= 1) { gCrossword.currentScale = 1 ; tx = 0; ty = 0; applyTransform(); }
      if (startScale < 1.0 && gCrossword.currentScale >= 1) { gCrossword.currentScale = 1 ; tx = 0; ty = 0; applyTransform(); }
    }
  }, { passive: true });
  //syncKb();

});
//-------------------------------------------------------------------------------------------------

function createCustomKeyboard() {
  const keyboard = document.createElement('div');
  keyboard.id = 'custom-keyboard';
  keyboard.className = 'custom-keyboard';

  const letterRowsQWERTY = [
    'QWERTYUIOP'.split(''),
    'ASDFGHJKL'.split(''),
    'ZXCVBNM'.split('')
  ];

  const letterRows = [
    'AZERTYUIOP'.split(''),
    'QSDFGHJKLM'.split(''),
    ['\u{2935}\u{FE0F}', '\u{1F4A1}', 'W', 'X', 'C', 'V', 'B', 'N'] //, '\u{2705}'] // ⤵️💡W...  ✅ for this one see below)
  ];

  /*
      //'\u{1F503}';  🔃
      ⤵️  alternative  "\u{2935}\u{FE0F}";
      '💡🔆🔓︎☢️ ✅ WXCVBN'.split('')
    const symbolRows = [
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
      ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')'],
      ['-', '+', '=', '/', '?', ':', ';', '"', "'", '\\']
    ];
  
    */
  const rows = letterRows;

  rows.forEach((row, rowIndex) => {
    const rowDiv = document.createElement('div');
    rowDiv.className = 'custom-keyboard-row';

    // ── TOP ROW: ⬅️ ... letters ... ➡️
    if (rowIndex === 0) {
      const leftArrow = document.createElement('div');
      leftArrow.className = 'custom-key wide-key cw-key-left';
      leftArrow.textContent = '<';
      leftArrow.addEventListener('click', () => {
        const skipFilled = gCrossword.config?.tab_key === 'tab_skip';
        gCrossword.moveToNextWord(true, skipFilled); // ← previous word
      });
      rowDiv.appendChild(leftArrow);
    }

    // main keys for the row
    row.forEach(letter => {
      if (letter === '💡' || letter === '\u{1F4A1}') { // special long/short press : see solveLetterWord
        solveLetterWord(rowDiv,letter);
      } else {
        const key = document.createElement('div');
        key.className = 'custom-key';
        key.textContent = letter;
        key.addEventListener('click', () => {
          if (gCrossword?.hidden_input) {
            // 1. Check for special emoji keys first
            if (letter === "\u{2935}\u{FE0F}" || letter === '⤵️' ) { //|| letter === '\u{1F503}' || letter === '🔃') {
                gCrossword.changeActiveClues(); // toggle direction
                //gCrossword.renderCells("dir switch"); // re-render after direction switch
            } else { // 2. Default behavior for normal letters
              gCrossword.hiddenInputChanged(letter);
              if (gCrossword.v_autocheck) { gCrossword.check_reveal('letter', 'check'); }
            }
          }
        });
        rowDiv.appendChild(key);
      }
    });
      // ================ 💡 : solve letter / word with short / long press : COUNTING CHEAT ========================
      function solveLetterWord(rowDiv, letter) {
        const solveLW = document.createElement('div');
        solveLW.className = 'custom-key solveword-key';
        solveLW.textContent = letter; // 💡

        let solvewordTimeout;
        let solvewordFired = false;

        function clearsolvewordState() {
            clearTimeout(solvewordTimeout);
            solvewordFired = false;
        }

        // Helper to trigger reveal and refresh UI
        function triggerReveal(type) {
            gCrossword.check_reveal(type, 'reveal');
            //gCrossword.renderCells();
            gCrossword.checkIfSolved();
        }

          solveLW.addEventListener('pointerdown', (e) => {
            e.preventDefault(); // Prevent ghost clicks
            solvewordFired = false;

            solvewordTimeout = setTimeout(() => {
            triggerReveal('word'); // Long press = WORD
            solvewordFired = true;
            }, 400);
        });

        solveLW.addEventListener('pointerup', () => {
            if (!solvewordFired) {
            // If the 400ms timer hasn't finished, it's a short tap
            clearTimeout(solvewordTimeout);
            triggerReveal('letter'); // Short tap = LETTER
            }
            clearsolvewordState();
        });

        solveLW.addEventListener('pointerleave', clearsolvewordState);
        solveLW.addEventListener('pointercancel', clearsolvewordState);
        
        rowDiv.appendChild(solveLW); // Fixed variable name from 'solveword' to 'solveLW'
        }
      // ===============================================================================================

    if (rowIndex === 0) {
      const rightArrow = document.createElement('div');
      rightArrow.className = 'custom-key wide-key cw-key-right';
      rightArrow.textContent = '>';
      rightArrow.addEventListener('click', () => {
        const skipFilled = gCrossword.config?.tab_key === 'tab_skip';
        gCrossword.moveToNextWord(false, skipFilled); // → next word
      });
      rowDiv.appendChild(rightArrow);
    }

    if (rowIndex === 2) {
      // ================ ✅ : solve word with long press NOT COUNTING CHEAT ========================
      const solveword = document.createElement('div');
      solveword.className = 'custom-key solveword-key';
      solveword.textContent = '\u{2705}'; // ✅
      //'\u{1F503}';  🔃

      let solvewordTimeout;
      let solvewordInterval;
      let solvewordHeld = false;
      let solvewordFired = false;

      function clearsolvewordState() {
        clearTimeout(solvewordTimeout);
        clearInterval(solvewordInterval);
        solvewordHeld = false;
        solvewordFired = false;
      }

      function performsolveword() {
        gCrossword.check_reveal('word', 'reveal', true); // NOT COUNTING CHEAT
        //gCrossword.renderCells();
        gCrossword.checkIfSolved();
      }

      solveword.addEventListener('pointerdown', () => {
        solvewordHeld = false;
        solvewordFired = false;
        solvewordTimeout = setTimeout(() => {
          solvewordHeld = true;
          performsolveword();
          solvewordFired = true;
        }, 400);
      });
      solveword.addEventListener('pointerup', () => {
        //if (!solvewordFired) performsolveword();
        clearsolvewordState();
      });
      solveword.addEventListener('pointerleave', clearsolvewordState);
      solveword.addEventListener('pointercancel', clearsolvewordState);

      rowDiv.appendChild(solveword);

      //===================================================================================
      // Backspace (bottom row, far right):  implements repeats if long press
      const backspace = document.createElement('div');
      backspace.className = 'custom-key backspace-key';
      //backspace.textContent = '⌫';
      backspace.textContent = '\u274C'; // ❌

      let backspaceTimeout;
      let backspaceInterval;
      let backspaceHeld = false;
      let backspaceFired = false;

      function clearBackspaceState() {
        clearTimeout(backspaceTimeout);
        clearInterval(backspaceInterval);
        backspaceHeld = false;
        backspaceFired = false;
      }

      function performBackspace() {
        var moveBack = true;;
        if (gCrossword.selected_cell && !gCrossword.selected_cell.fixed) {
          // dont move back cursor if cell content was wrong:
          if (gCrossword.selected_cell.letter != gCrossword.selected_cell.solution) { moveBack = false; }
          gCrossword.updateCell(gCrossword.selected_cell, {
                letter: '',
                checked: false
              });
          gCrossword.autofill();
          // update $('#this-word-letters-mobile'):
          if (gCrossword.selected_word) gCrossword.showCurrentWordStateAsString(gCrossword.selected_word);

          if (gCrossword.diagramless_mode) {
            // Move to the previous editable cell based on current diagramless direction
            const prev = gCrossword.nextDiagramlessCell(gCrossword.selected_cell, gCrossword.diagramless_dir, -1);
            if (prev) gCrossword.setActiveCell(prev);
            // classic grid here:
          } else if (moveBack && gCrossword.selected_word) {
            const prev_cell = gCrossword.selected_word.getPreviousCell(
              gCrossword.selected_cell.x,
              gCrossword.selected_cell.y
            );
            gCrossword.setActiveCell(prev_cell);
          }

          //gCrossword.renderCells();
          gCrossword.checkIfSolved();
        }
      }

      backspace.addEventListener('pointerdown', () => {
        backspaceHeld = false;
        backspaceFired = false;
        backspaceTimeout = setTimeout(() => {
          backspaceHeld = true;
          performBackspace();
          backspaceFired = true;
          backspaceInterval = setInterval(performBackspace, 120);
        }, 600);
      });
      backspace.addEventListener('pointerup', () => {
        if (!backspaceFired) performBackspace();
        clearBackspaceState();
      });
      backspace.addEventListener('pointerleave', clearBackspaceState);
      backspace.addEventListener('pointercancel', clearBackspaceState);

      rowDiv.appendChild(backspace);
    }

    keyboard.appendChild(rowDiv);
  });

  console.log('[MOBILE] crossword.mobile.js loaded');
  return keyboard;
} // END createCustomKeyboard
