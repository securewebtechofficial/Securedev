# Cart drawer upsell

Adds a "You may also like" cross-sell **carousel** inside the cart drawer. It shows **two products
at once as a 60% / 40% split** — the first card takes roughly 60% of the drawer width and the next
card peeks in at roughly 40%. It is a horizontal, swipeable track that **loops endlessly**: past the
last card comes the first again, and going back from the first brings up the last. On touch you swipe
between cards, on desktop the prev/next arrows, a mouse wheel or click-and-drag scroll one card at a
time (wrapping at both ends), and the arrows hide themselves when everything already fits. Suggested
products can be added to the cart
with AJAX — the drawer refreshes in place and the product that was just added disappears from the
carousel automatically.

Built against the current Dawn cart drawer (`snippets/cart-drawer.liquid`) that you shared.

## Files

| File | What it is |
| --- | --- |
| `snippets/cart-upsell.liquid` | New. Chooses the suggestions and renders the block. |
| `snippets/cart-drawer.liquid` | Updated. One line added inside `<cart-drawer-items>`. |
| `assets/cart-upsell.js` | New. `<cart-upsell>` custom element: AJAX add + drawer refresh. |
| `assets/cart-upsell.css` | New. Block styling. |
| `config/settings_schema.cart-upsell.json` | New. Settings to merge into `settings_schema.json`. |
| `preview/index.html` | Static visual/interaction preview (no store needed). |

## Install

1. Copy the two snippets into `snippets/` and the two assets into `assets/` (keep the names).
2. In `snippets/cart-drawer.liquid`, the block is rendered just after the cart form:

   ```liquid
   </form>
   {%- render 'cart-upsell', cart: cart -%}
   </cart-drawer-items>
   ```

   If you are applying this to your own copy, add that one line in the same place — inside
   `<cart-drawer-items>`, after the closing `</form>`. Being inside `cart-drawer-items` is what
   makes it refresh with the cart and stay in sync.

3. Merge `config/settings_schema.cart-upsell.json` into the `settings` array of the
   **Cart** group in `config/settings_schema.json` (or create a new group with the same block).

That's it. No `theme.liquid` change is needed: the drawer snippet already loads on every page
when the cart type is **Drawer**, and the snippet pulls in its own CSS/JS.

## Configure (Theme settings → Cart)

- **Heading** — `cart_upsell_heading` (default "You may also like").
- **Upsell products** — `cart_upsell_products`, a product list. Suggested first.
- **Upsell collection** — `cart_upsell_collection`, used only when no individual products are set.
- **Maximum suggestions** — `cart_upsell_limit` (1–4, default 2).

### Optional: product-specific upsells via metafield

Create a product metafield **`custom.cart_upsell`** of type *Product → List of products*.
When that product is in the cart, its metafield products are suggested **before** the settings
products. This is the right place for "frequently bought together" style pairs.

## How it works

- **Where it lives.** The block renders inside `<cart-drawer-items>`, which the drawer already
  re-renders from `?section_id=cart-drawer` after every cart change. So after an add, the server
  returns a fresh drawer in which the just-added product is no longer suggested — no client-side
  filtering needed.
- **Carousel & 60/40 split.** `.cart-upsell__list` is a horizontal, scroll-snapping track
  (`overflow-x: auto`, `scroll-snap-type: x mandatory`), so touch swiping is native. Each card is
  `flex: 0 0 calc(60% - 0.6rem)`, which is what makes the first card ~60% of the drawer and the next
  card peek in at ~40%. `assets/cart-upsell.js` adds the prev/next buttons (one card per press),
  and on desktop it also maps the vertical mouse wheel over the track to a horizontal scroll and
  supports click-and-drag. The whole nav is hidden (`.cart-upsell--static`) whenever the cards fit
  without scrolling — for example when only one suggestion is available, the single card then
  expands to full width.
- **Endless loop.** When at least two suggestions exist and the track overflows, the script clones the
  original cards once after them (clones are `aria-hidden` and removed from the tab order) and
  measures the width of one full set. Next/prev, wheel and drag all wrap: scrolling past the last
  card reveals the first, and going back from the first reveals the last. The script normalises the
  scroll position back into the first set during the scroll event, so the wrap is invisible and the
  prev/next arrows never disable while the track is looping.
- **Adding.** `assets/cart-upsell.js` intercepts the small add form, POSTs to `/cart/add` with the
  `sections` parameter, and hands the response to the drawer's own `renderContents()`, which repaints
  the drawer and the header cart bubble. It reuses Dawn's existing pipeline, so nothing new is
  introduced into the cart flow.
- **Sources & filtering.** Suggestions come from (1) the `custom.cart_upsell` metafield on cart
  products, then (2) the products setting, then (3) the collection; duplicates and products already
  in the cart are skipped, unavailable products are skipped, and the list is capped at the limit.
- **No JS?** If the drawer's `renderContents` is unavailable the form falls back to a normal POST to
  `/cart/add`.

## Troubleshooting: only one card shows

The block can only show as many products as it can find. If you see a single full-width card:

1. **Check the limit.** Theme settings → Cart upsell → *Maximum suggestions* must be 2 or more
   (the default and minimum are both 2).
2. **Check that two candidates exist.** Only *available* products that are *not already in the cart*
   are suggested. The sources are, in order: the `custom.cart_upsell` metafield on products in the
   cart, the *Upsell products* setting, then the *Upsell collection*. Add at least two products
   across those sources (excluding the ones in the cart).
3. **Turn off a duplicate block.** If your theme also has Dawn's native complementary-products block
   in the drawer, disable it — otherwise you get two "You may also like" areas.

When only one candidate is left the carousel deliberately goes full width and hides its arrows.

## Troubleshooting: border looks broken

If the block's border renders as a stray vertical line, is doubled, or is missing its top/bottom
edge, the `<cart-upsell>` element is being laid out as `display: inline` (the default for a custom
element). An inline box that contains flex children gets split into anonymous fragments, so the
border is drawn per fragment. `assets/cart-upsell.css` fixes this with `display: block` on
`.cart-upsell`. If you copied the CSS into your theme's stylesheet, keep that declaration — or add
`cart-upsell { display: block; }` yourself.

## Limitations

- Single-variant products get a round **+** button (icon only, no label text) that adds the first
  available variant. The button carries an `aria-label` of `Add to cart: <product title>` so it is
  still announced by screen readers; if you switch to another icon, keep that label. Products with
  variants show a **Choose options** link to the product page instead, to avoid adding the wrong
  variant. If you want in-place variant selection, that is a follow-up.
- The heading and the error text default to English. Set the heading in theme settings; for a
  translated heading/error, add locale keys and switch to `{{ 'key' | t }}`.
- The block only shows while the cart has at least one item.
- The prev/next buttons step the track one card at a time and wrap at both ends; on desktop a
  trackpad/touchpad swipe and click-and-drag also work. Scrolling is left-to-right only (RTL is not
  handled).
- The loop needs at least **two** suggestions and a track wider than the drawer. With a single
  suggestion the card goes full width and the arrows hide; the loop is skipped.

## Preview

`preview/index.html` is a self-contained mock of the drawer (no store connection). It uses the same
`cart-upsell.css`, shows the carousel with **two suggestions** at the 60/40 split (swipe it on
mobile, or use the arrows / mouse wheel / drag on desktop) and **loops endlessly** in both
directions, and simulates the add: the product moves into the cart, the badge and subtotal update,
the card (and its clone) leaves the carousel. Open it directly, or serve the folder and open
`/preview/`.

## Suggested next steps

- Set up the `custom.cart_upsell` metafield on your best sellers.
- Add a `sections/cart-upsell.liquid`-style `{% doc %}`-commented variant if you want to drive it
  from a section block instead of theme settings.
- If you use it on a high-traffic store, move the CSS into the cart-drawer head include in
  `layout/theme.liquid` to avoid a style flash.
