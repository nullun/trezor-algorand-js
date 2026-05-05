# Browser example

A single-file HTML demo that connects to a Trezor over WebUSB and derives
an Algorand address. No build step — module resolution is handled by an
import map pointing at [esm.sh][esm].

## Run

WebUSB requires a secure context (HTTPS or `localhost`), so the file
cannot be opened directly from disk. Serve the directory:

```
cd examples/browser
python3 -m http.server 8080
```

Then open <http://localhost:8080> in Chrome or Edge. Firefox and Safari
do not support WebUSB.

## How it works

The import map at the top of `index.html` resolves the bare specifier
`trezor-algorand-js` to a CDN URL:

```html
<script type="importmap">
{
  "imports": {
    "trezor-algorand-js": "https://esm.sh/trezor-algorand-js@0.1.0"
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

## Developing against a local build

To test changes to the package source without publishing, build it and
point the import map at the local `dist/` instead:

```
npm run build      # from the repo root
```

Then in `index.html`, replace the CDN URL with a relative path:

```json
{
  "imports": {
    "trezor-algorand-js": "../../dist/index.js"
  }
}
```

Serve from the repo root rather than `examples/browser/` so the relative
path resolves:

```
python3 -m http.server 8080
# open http://localhost:8080/examples/browser/
```

[esm]: https://esm.sh
