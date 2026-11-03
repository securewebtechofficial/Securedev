/**
 * <cart-upsell> — a swipeable 60/40 cross-sell carousel inside the cart drawer.
 *
 * Two responsibilities:
 *  1. Add a suggested product to the cart without leaving the drawer. The POST
 *     sends the `sections` parameter and the response is handed to the cart
 *     drawer's own `renderContents()`, so the drawer and the header cart bubble
 *     repaint. Because this element lives inside <cart-drawer-items>, the fresh
 *     render drops the product that was just added from the carousel.
 *  2. Drive the horizontal scroll-snap track. Touch swipes scroll it natively;
 *     on desktop the prev/next buttons, a vertical mouse wheel over the track,
 *     and click-and-drag all scroll it one card at a time.
 *
 * The track loops endlessly. Once the original cards are scrollable, one full
 * set is cloned after them and the scroll position is normalised back into the
 * first set whenever it crosses the boundary. Because the clone is identical,
 * the reset is invisible; scrolling past the last card simply reveals the first
 * again (and going back from the first reveals the last). The prev/next buttons
 * therefore never disable while the track is looping. The whole nav still hides
 * when the cards already fit without scrolling (e.g. a single suggestion).
 *
 * If the drawer render API is not present, the add form is left to submit
 * natively to /cart/add as a no-JS fallback.
 */
class CartUpsell extends HTMLElement {
  constructor() {
    super();
    this.onSubmit = this.onSubmit.bind(this);
    this.addEventListener('submit', this.onSubmit);
  }

  connectedCallback() {
    if (this.initialised) return;
    this.initialised = true;

    this.list = this.querySelector('.cart-upsell__list');
    this.prevButton = this.querySelector('[data-upsell-prev]');
    this.nextButton = this.querySelector('[data-upsell-next]');
    if (!this.list) return;

    this.updateNav = this.updateNav.bind(this);
    this.onScroll = this.onScroll.bind(this);
    this.onWheel = this.onWheel.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onClickCapture = this.onClickCapture.bind(this);

    this.loopReady = false;
    this.setWidth = 0;

    this.list.addEventListener('scroll', this.onScroll, { passive: true });
    this.list.addEventListener('wheel', this.onWheel, { passive: false });
    this.list.addEventListener('pointerdown', this.onPointerDown);
    this.list.addEventListener('click', this.onClickCapture, true);
    this.prevButton?.addEventListener('click', () => this.scrollByCard(-1));
    this.nextButton?.addEventListener('click', () => this.scrollByCard(1));

    if ('ResizeObserver' in window) {
      this.resizeObserver = new ResizeObserver(() => {
        this.measureLoop();
        this.updateNav();
      });
      this.resizeObserver.observe(this.list);
    }
    this.updateNav();
  }

  disconnectedCallback() {
    this.resizeObserver?.disconnect();
    clearTimeout(this.normaliseTimer);
  }

  get cartDrawer() {
    return document.querySelector('cart-drawer');
  }

  isScrollable() {
    return this.list.scrollWidth - this.list.clientWidth > 2;
  }

  cardStep() {
    const item = this.list.querySelector('.cart-upsell__item');
    if (!item) return this.list.clientWidth;
    const styles = getComputedStyle(this.list);
    const gap = parseFloat(styles.columnGap) || parseFloat(styles.gap) || 0;
    return item.getBoundingClientRect().width + gap;
  }

  // --- Endless loop -------------------------------------------------------
  // One full set of cards is cloned after the originals. The scroll position
  // is kept inside [0, setWidth) by normaliseLoop(); since a position one set
  // further shows the same cards, the reset is invisible. The clones are
  // presentation-only: hidden from assistive tech and removed from tab order,
  // but their add buttons still work (the drawer re-renders after an add).

  setupLoop() {
    if (this.loopReady || !this.list) return;
    const originals = Array.from(
      this.list.querySelectorAll('.cart-upsell__item:not([data-upsell-clone])')
    );
    if (originals.length < 2 || !this.isScrollable()) return;

    originals.forEach((item, index) => {
      const clone = item.cloneNode(true);
      clone.setAttribute('data-upsell-clone', '');
      clone.setAttribute('data-upsell-clone-of', String(index));
      clone.setAttribute('aria-hidden', 'true');
      clone.querySelectorAll('a, button, input, select, textarea').forEach((el) => {
        el.setAttribute('tabindex', '-1');
      });
      this.list.appendChild(clone);
    });

    this.loopReady = true;
    this.measureLoop();
  }

  // Distance between an original card and its clone = width of one full set.
  measureLoop() {
    if (!this.loopReady) {
      this.setWidth = 0;
      return;
    }
    const first = this.list.querySelector('.cart-upsell__item:not([data-upsell-clone])');
    const firstClone = this.list.querySelector('[data-upsell-clone]');
    if (!first || !firstClone) {
      this.setWidth = 0;
      return;
    }
    const width = firstClone.getBoundingClientRect().left - first.getBoundingClientRect().left;
    this.setWidth = width > 1 ? Math.round(width) : 0;
  }

  // Called from the scroll handler. Any position past the cloned set (or
  // before zero) is mapped back into the first set. ScrollLeft assignment is
  // instant, so the user never sees the jump.
  normaliseLoop() {
    if (!this.loopReady || !this.setWidth || this.isNormalising) return;
    const width = this.setWidth;
    const left = this.list.scrollLeft;
    if (left < width - 0.5 && left >= -0.5) return;

    this.isNormalising = true;
    this.list.style.scrollBehavior = 'auto';
    this.list.scrollLeft = ((left % width) + width) % width;
    requestAnimationFrame(() => {
      this.list.style.scrollBehavior = '';
      this.isNormalising = false;
    });
  }

  onScroll() {
    this.normaliseLoop();
    this.updateNav();
  }

  scrollByCard(direction) {
    const step = this.cardStep();
    const width = this.setWidth;

    if (this.loopReady && width) {
      let target = this.list.scrollLeft + direction * step;

      if (direction < 0 && target < 0) {
        // Going back from the first card: jump invisibly to the cloned set,
        // then animate one card backwards so the last card slides in. The
        // short flag keeps the scroll handler from normalising the jump.
        this.isNormalising = true;
        this.list.style.scrollBehavior = 'auto';
        this.list.scrollLeft = width;
        requestAnimationFrame(() => {
          this.list.style.scrollBehavior = '';
          this.list.scrollTo({ left: width - step, behavior: 'smooth' });
        });
        clearTimeout(this.normaliseTimer);
        this.normaliseTimer = setTimeout(() => {
          this.isNormalising = false;
        }, 350);
        return;
      }

      if (target >= width - 0.5) {
        // Forward past the last card: animate onto the cloned first card;
        // the scroll handler then normalises back to zero invisibly.
        target = width;
      }

      this.list.scrollTo({ left: target, behavior: 'smooth' });
      return;
    }

    this.list.scrollBy({ left: direction * step, behavior: 'smooth' });
  }

  updateNav() {
    if (!this.list || !this.isConnected) return;

    // The drawer starts hidden (zero width), so the first call may not be
    // scrollable yet. Keep trying until the loop can be set up.
    this.setupLoop();
    this.measureLoop();

    const maxScroll = this.list.scrollWidth - this.list.clientWidth;
    const isStatic = maxScroll <= 2;
    this.classList.toggle('cart-upsell--static', isStatic);

    // While looping there is no first/last edge, so never disable the arrows.
    const looping = this.loopReady && !isStatic;
    if (this.prevButton) {
      this.prevButton.disabled = isStatic || (!looping && this.list.scrollLeft <= 2);
    }
    if (this.nextButton) {
      this.nextButton.disabled = isStatic || (!looping && this.list.scrollLeft >= maxScroll - 2);
    }
  }

  // Desktop: translate a vertical wheel over the track into horizontal scroll.
  // At either end of the first set we wrap instead of stopping, so the track
  // scrolls endlessly in both directions.
  onWheel(event) {
    if (!this.isScrollable()) return;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (delta === 0) return;

    const width = this.setWidth;
    if (!this.loopReady || !width) {
      const maxScroll = this.list.scrollWidth - this.list.clientWidth;
      if ((this.list.scrollLeft <= 0 && delta < 0) || (this.list.scrollLeft >= maxScroll - 1 && delta > 0)) return;
      event.preventDefault();
      this.list.scrollBy({ left: delta, behavior: 'auto' });
      return;
    }

    event.preventDefault();
    let left = this.list.scrollLeft + delta;
    if (left < 0) {
      // Wrap backwards onto the last snap position of the previous set.
      left = Math.max(width - this.cardStep(), 0);
    }
    this.list.scrollLeft = left;
  }

  // Desktop: click-and-drag to scroll (touch already scrolls natively, so this
  // only reacts to a mouse pointer). Pointer capture is deliberately avoided so
  // that a simple click on a card's button still fires normally.
  onPointerDown(event) {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    if (!this.isScrollable()) return;

    this.isDragging = true;
    this.dragStartX = event.clientX;
    this.dragStartScroll = this.list.scrollLeft;
    this.dragMoved = 0;
    this.list.classList.add('is-dragging');

    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
  }

  onPointerMove(event) {
    if (!this.isDragging) return;
    const dx = event.clientX - this.dragStartX;
    this.dragMoved = Math.max(this.dragMoved, Math.abs(dx));
    const desired = this.dragStartScroll - dx;
    const width = this.setWidth;
    if (this.loopReady && width) {
      // Dragging past either end wraps around to the other side of the set.
      this.list.scrollLeft = ((desired % width) + width) % width;
    } else {
      this.list.scrollLeft = desired;
    }
  }

  onPointerUp() {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.list.classList.remove('is-dragging');
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);

    this.suppressNextClick = this.dragMoved > 4;
    this.updateNav();
  }

  onClickCapture(event) {
    if (!this.suppressNextClick) return;
    this.suppressNextClick = false;
    event.preventDefault();
    event.stopPropagation();
  }

  onSubmit(event) {
    const form = event.target.closest('[data-cart-upsell-form]');
    if (!form || !this.contains(form)) return;

    const drawer = this.cartDrawer;
    if (!drawer || typeof drawer.renderContents !== 'function') return;

    event.preventDefault();

    const button = form.querySelector('[data-upsell-button]');
    if (button && button.getAttribute('aria-disabled') === 'true') return;

    this.setLoading(button, true);
    this.hideError();

    const formData = new FormData(form);
    formData.append('sections', 'cart-drawer,cart-icon-bubble');
    formData.append('sections_url', window.location.pathname);

    fetch((window.routes && window.routes.cart_add_url) || '/cart/add', {
      method: 'POST',
      headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: formData,
    })
      .then((response) => response.json())
      .then((parsedState) => {
        if (parsedState.status) {
          this.showError(parsedState.description || parsedState.message);
          return;
        }
        drawer.classList.remove('is-empty');
        drawer.renderContents(parsedState);
      })
      .catch(() => this.showError())
      .finally(() => this.setLoading(button, false));
  }

  setLoading(button, isLoading) {
    if (!button) return;
    button.toggleAttribute('aria-disabled', isLoading);
    button.classList.toggle('loading', isLoading);
    const spinner = button.querySelector('.loading__spinner');
    if (spinner) spinner.classList.toggle('hidden', !isLoading);
  }

  showError(message) {
    const errorElement = this.querySelector('.cart-upsell__error');
    if (!errorElement) return;
    errorElement.textContent = message || this.dataset.errorMessage || 'Something went wrong. Please try again.';
    errorElement.hidden = false;
    clearTimeout(this.errorTimer);
    this.errorTimer = setTimeout(() => {
      errorElement.hidden = true;
    }, 6000);
  }

  hideError() {
    const errorElement = this.querySelector('.cart-upsell__error');
    if (errorElement) errorElement.hidden = true;
  }
}

if (!customElements.get('cart-upsell')) {
  customElements.define('cart-upsell', CartUpsell);
}
