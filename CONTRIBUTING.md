# Contributing to FLECT

Thanks for taking the time to improve a tool people write books in. Two rules
matter more than the rest: **do not break a writer's text**, and **do not ship
code you have not run**.

## Before you start

- Open an issue for anything larger than a typo or a one-line fix, so the design
  can be settled before the code exists.
- Check the [roadmap](README.md#roadmap) and open issues for work already in
  flight.
- Security problems do not belong in issues. See [SECURITY.md](SECURITY.md).

## Development setup

```bash
npm install
npm run dev        # Vite + Electron with hot reload
npm test           # unit tests
npm run check:static
```

`npm run test:e2e` drives a real Electron window against a local mock provider.
It needs an interactive desktop session, so it does not run in CI.

## What a change has to pass

| Check | Command |
|-------|---------|
| Unit | `npm test` |
| Static packaging and routing | `npm run check:static` |
| End-to-end, when the change touches the editor, AI path or chrome | `npm run test:e2e` |
| Export formats, when the change touches a serializer | `npm run test:artifacts` |

A pull request that changes behaviour without a test that would have caught the
bug is treated as incomplete. Bug-fix PRs should include a failing test first.

## House style

- **No em dashes, en dashes or double hyphens** in shipped prompts, UI copy or
  documentation. This is a product rule, not a preference: the editor exists to
  keep machine cadence out of prose.
- Prompts live in `src/lib/prompts.js` and must keep the `{{selection}}`,
  `{{context}}` and `{{instruction}}` placeholders working, because users edit
  them.
- The renderer never imports Node built-ins and never touches the file system.
  Anything that needs the disk or the network goes through `preload.js`.
- Match the surrounding code: two spaces, single quotes, no semicolon-free
  one-liners that hide control flow.
- Commit messages are imperative and explain the why in the body when the change
  is not obvious.

## Pull requests

1. Branch from `main`: `fix/short-name` or `feat/short-name`.
2. Keep the diff focused. Unrelated cleanups belong in their own PR.
3. Describe what you changed, how you tested it, and what you could not test.
4. Screenshots for anything visual.

Maintainers squash-merge. Your commit message becomes the changelog line, so
write it as one.

## Licensing

By contributing you agree that your work is licensed under the [MIT license](LICENSE).
