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
status: planned
Given a request to save arrives with a missing or wrongly typed field, an oversized payload, or extra prototype keys
When the receiving process validates it
Then it returns a typed error, writes nothing, and stays responsive

### AC-SEC-08 — Only http, https and mailto links reach the system browser
status: planned
Given a request to open an external link arrives at the process boundary
When its URL is `file:`, `javascript:`, `data:`, unparsable or not a string
Then it is refused with a typed error and nothing is opened
