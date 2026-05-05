# Browser example

A single-file HTML demo that connects to a Trezor over WebUSB and derives
an Algorand address. No bundler, no remote dependencies — module
resolution is handled by an import map pointing at the repo's local
`dist/`.

## Run

WebUSB requires a secure context (HTTPS or `localhost`), so the file
cannot be opened directly from disk. Build the package, then serve the
repo root:

```
npm install
npm run build
python3 -m http.server 8080
```

Then open <http://localhost:8080/examples/browser/> in Chrome or Edge.
Firefox and Safari do not support WebUSB.

If you change source files under `src/`, re-run `npm run build` and
refresh the page.

## How it works

The import map at the top of `index.html` resolves the bare specifier
`trezor-algorand-js` to the freshly built `dist/index.js`:

```html
<script type="importmap">
{
  "imports": {
    "trezor-algorand-js": "../../dist/index.js"
  }
}
</script>
```

The page itself uses the same imports a real consumer would write:

```js
import {
  TrezorAlgorandClient,
  WebUsbTransport,
  defaultAlgorandPath,
} from "trezor-algorand-js";
```

A user gesture (clicking **Connect Trezor**) is required for
`WebUsbTransport.request()` — browsers reject `navigator.usb.requestDevice`
calls that originate outside an event handler.

## Consuming the published package

In your own app, swap the import-map target for either a bundled copy
under `node_modules/` or a CDN URL such as
`https://esm.sh/trezor-algorand-js`. The rest of the page stays the same.
