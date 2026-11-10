# Export fixture: images

The two images below live next to this file, under `assets/`, and are
referenced by a relative path. A test that exports this document has to
copy the whole `test/fixtures/export/` folder, otherwise the images cannot
be resolved.

![A blue square](assets/diagram.png)

![An orange badge](assets/badge.png "Badge title")

## An image inside a link

[![The badge as a link](assets/badge.png)](https://example.com/docs)

## A missing image

![A picture that is not there](assets/missing.png)

The paragraph after the broken image must still be exported.
