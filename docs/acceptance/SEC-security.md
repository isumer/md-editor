# SEC — Security

### AC-SEC-01 — External links open in the system browser, never in the app
status: implemented
Given the preview shows a link to `https://example.com/`
When the user clicks it
Then the system browser is asked to open that URL, the window stays on the app, and the editor text is unchanged

### AC-SEC-02 — Script and unsupported link schemes do nothing
status: implemented
Given the preview contains a link whose URL is `javascript:alert(1)`
When the user clicks it
Then no script runs, nothing is opened, the window does not navigate, and the status bar says the link cannot be opened

### AC-SEC-03 — In-document anchors scroll the preview
status: implemented
Given the preview has a link `#jump-here` and an element with id `jump-here` further down
When the user clicks the link
Then the preview scrolls to the element and the window does not navigate

### AC-SEC-04 — Active and document-level HTML is removed from the preview
status: implemented
Given a document containing `<script>`, `<style>`, `<link>`, `<meta>`, `<base>`, `<form>` and an `onerror` handler
When it is previewed
Then none of them is present in the preview DOM, no handler runs, and the editor stays visible

### AC-SEC-05 — Ids that could clobber DOM properties are dropped
status: implemented
Given raw HTML with an id equal to a DOM property name (e.g. `id="location"`)
When it is previewed
Then that element has no id

### AC-SEC-06 — Packaged binaries carry the hardening fuses
status: implemented
Given a packaged build for any platform
When its Electron fuses are read
Then RunAsNode, NODE_OPTIONS and --inspect are disabled, the app loads only from its ASAR with integrity validation, and cookie encryption is on

### AC-SEC-07 — Malformed requests are refused at the process boundary
status: implemented
Given a request to save arrives with a missing or wrongly typed field, an oversized payload, or extra prototype keys
When the receiving process validates it
Then it returns a typed error, writes nothing, and stays responsive

### AC-SEC-08 — Only http, https and mailto links reach the system browser
status: implemented
Given a request to open an external link arrives at the process boundary
When its URL is `file:`, `javascript:`, `data:`, unparsable or not a string
Then it is refused with a typed error and nothing is opened

### AC-SEC-09 — The renderer can write only files the user chose
status: implemented
Given the renderer asks to save
When it presents a path or an unknown, forged, revoked or other-window grant instead of a grant issued for a file the user picked (dialog, command line, open-file)
Then the request is refused with a typed error and nothing is written

### AC-SEC-10 — Only the window's own top frame may call the app's services
status: implemented
Given a request arrives over IPC
When its sender frame is not the top frame of a window the app created
Then it is refused with a typed error before any service runs

### AC-SEC-11 — The preload exposes a fixed, named API
status: implemented
Given the page inspects `window.api`
When it lists its members
Then it finds exactly the documented functions, none of which accepts a channel name, and no other global from the preload exists

### AC-SEC-12 — The file process honours only grants the main process registered
status: implemented
Given the renderer talks to the file process over its port
When a message presents a raw path, an unknown, revoked or other-window grant, or a malformed body
Then the file process refuses it with a typed error before touching the disk, and stays responsive

### AC-SEC-13 — Document copies in the file process accept only valid changes from their own window
status: implemented
Given the page sends attach, change, save or detach messages over its port
When a message has extra keys, wrong types, out-of-range or non-consecutive versions, an old epoch, a malformed change set, or names another window's document
Then the file process drops or refuses it without changing any document copy or file, and still answers the next valid message

### AC-SEC-14 — The app runs from its own origin and serves only its bundle
status: implemented
Given the app window is open
When the page reads `location.origin` and requests a file outside the bundle through `app://` (a `..` escape, an encoded escape, an absolute path, another host)
Then the origin is `app://bundle`, the bundle files load, and every outside request is refused with 404 and no file content

### AC-SEC-15 — The page policy blocks inline script, eval and file images
status: implemented
Given the page is running with its content security policy
When an inline script or `eval` is attempted, or an image is requested from a `file:` URL
Then a `securitypolicyviolation` is reported for each, nothing runs or loads, and the live window reports sandbox, context isolation and web security on and Node integration off

### AC-SEC-16 — Document images resolve only inside the document's folder tree
status: planned
Given a Markdown document whose folder holds an image and whose text references it by a relative path
When the preview rewrites the reference to `doc-asset://` and the app serves it
Then the image inside the document's folder loads; and a reference that escapes the folder — via `..`, `%2e%2e`, `%2f..`, a backslash, an absolute path, a UNC path, a device name or an ADS — is refused with 404 and no bytes outside the folder are read

### AC-SEC-17 — `doc-asset://` honours grants and window keying and streams without buffering
status: planned
Given a `doc-asset://` request
When its window id or grant is unknown, revoked, or names another window's document
Then it is refused with 404 and no file content; a valid request for a file inside the document's folder streams the bytes with the right content type, without decoding or buffering them in main
