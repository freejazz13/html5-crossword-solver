/**
Copyright (c) 2025, Crossword Nexus & Crossweird LLC
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
**/

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
          row1.append(file, check, reveal, settings);

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
              const isInactive = group !== this.clueGroups[this.activeClueGroupIndex];
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


      //const row2 = document.createElement('div');
      //row2.className = 'cw-buttons-row';
      //row2.append(timer);

      // Add text field above drawer
      const thisWordLetters = document.createElement('span');
      thisWordLetters.id = 'this-word-letters-mobile';

      // Add drawer to wrapper
      wrapper.appendChild(thisWordLetters);
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
                gCrossword.renderCells("dir switch"); // re-render after direction switch
            //}
            //else if (letter === '💡' || letter === '\u{1F4A1}') {
              //gCrossword.check_reveal('letter', 'reveal');
            } else {
              // 2. Default behavior for normal letters
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
            gCrossword.renderCells();
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
        gCrossword.renderCells();
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
          gCrossword.selected_cell.letter = '';
          gCrossword.selected_cell.checked = false;
          gCrossword.autofill();

          if (gCrossword.diagramless_mode) {
            // Move to the previous editable cell based on current diagramless direction
            const prev = gCrossword.nextDiagramlessCell(this.selected_cell, this.diagramless_dir, -1);
            if (prev) gCrossword.setActiveCell(prev);
            // classic grid here:
          } else if (moveBack && gCrossword.selected_word) {
            const prev_cell = gCrossword.selected_word.getPreviousCell(
              gCrossword.selected_cell.x,
              gCrossword.selected_cell.y
            );
            gCrossword.setActiveCell(prev_cell);
          }

          gCrossword.renderCells();
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
