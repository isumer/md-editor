# Notes for slice 4 (preview pipeline)

- AC-R1-06 (a failed render keeps the last good preview) needs a test
  seam: no real input makes markdown-it throw. 3a did not add one (Vision
  hit its usage limit before that part). Slice 4 rewrites the worker
  protocol anyway: inject the render-worker factory at the composition
  root and drive success → failure → success from an e2e boundary double
  without a test branch in src.
