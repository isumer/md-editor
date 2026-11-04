# Notes for slice 3b (collected before its brief)

- AC-SEC-07 cases moved out of 3.0 because today's code accepts them:
  a save request with an own `__proto__` key, and a 300 MB text. 3b's
  contract validators must reject unknown keys and enforce a size limit
  (decide the limit: e.g. 512 MB documents are out of scope; the large-
  file plan targets 20 MB typical, 50 MB "large-file mode"), with the
  two tests restored from git history (commit of slice 3.0's parent run).
- Open failures should name the file in a user-facing message
  (`ServiceError.messageKey`); today a directory read says only
  `EISDIR: illegal operation on a directory, read` (3.0 pins that).
