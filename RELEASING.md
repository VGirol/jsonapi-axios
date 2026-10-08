# Releasing a new version

Versions are published to npm by GitHub Actions when a `v*` tag is pushed (`.github/workflows/publish.yml`). The
workflow uses npm trusted publishing: there is no npm token to manage, and each version is published with its
provenance.

## Before the first release from CI

This is done once, on npmjs.com, in the settings of `@vgirol/jsonapi-axios`, under **Trusted Publisher** (GitHub
Actions):

| Field                | Value           |
| -------------------- | --------------- |
| Organization or user | `VGirol`        |
| Repository           | `jsonapi-axios` |
| Workflow filename    | `publish.yml`   |
| Environment name     | `npm`           |

Without it, the `publish` job fails on `npm publish`, and nothing is published.

## Choosing the version number

The package follows [semantic versioning](https://semver.org/). While the version is `0.x`:

- a breaking change bumps the **minor** version: `0.1.3` → `0.2.0`;
- a new feature or a fix bumps the **patch** version: `0.1.3` → `0.1.4`.

A breaking change is any change to `etc/jsonapi-axios.api.md` that removes or changes something, any change of
behavior that existing code can notice, and moving the `peerDependencies` range to a new minor version of
`jsonapi-ts` (see below).

## Following a new version of `jsonapi-ts`

`@vgirol/jsonapi-ts` is a peer dependency: the application installs it, and the adapter uses that copy. The adapter
is developed and tested against the **published** version, as a user would install it.

- **A new patch version of `jsonapi-ts`** (`0.1.3` → `0.1.4`) is already accepted by the range `^0.1.0`. Nothing to
  do, unless the adapter needs the fix: then raise the lower bound (`^0.1.4`) and release a patch version.

- **A new minor version of `jsonapi-ts`** (`0.1.x` → `0.2.0`) is outside the range `^0.1.0`. Users of the adapter
  cannot upgrade until a new version of the adapter accepts it:
  1. wait until `npm view @vgirol/jsonapi-ts version` shows the new version;
  2. set the same range in `peerDependencies` **and** `devDependencies`: `"@vgirol/jsonapi-ts": "^0.2.0"`;
  3. run `yarn install`, which updates `yarn.lock`, then adapt the code if needed;
  4. release a new minor version of the adapter.

  The integration test checks that the range is exactly `^0.<minor>.0` of the installed `jsonapi-ts`. It fails when
  only one of the two fields was updated.

For a change in both packages during development, link a local clone of `jsonapi-ts` with
`yarn link ../jsonapi-ts` (after `yarn build` in `jsonapi-ts`). Do not commit the link: `package.json` and
`yarn.lock` must point to the published version when the adapter is released.

## Steps

1. **Start from an up-to-date `master`**, with a green CI.

   ```sh
   git switch master && git pull
   ```

2. **Update `CHANGELOG.md`.** Move the changes under a new heading with the version and the date, and add the link
   at the bottom of the file. Mention the supported `jsonapi-ts` range when it changes:

   ```md
   ## [0.2.0] - 2026-11-15

   ### Changed

   - Requires `@vgirol/jsonapi-ts` `^0.2.0`.

   [0.2.0]: https://github.com/VGirol/jsonapi-axios/releases/tag/v0.2.0
   ```

3. **Set the version** in `package.json`:

   ```sh
   yarn version 0.2.0
   ```

4. **Check everything locally**, as the workflow will:

   ```sh
   yarn install --immutable
   yarn lint
   yarn build
   yarn test run
   yarn test:integration
   ```

   `yarn test:integration` runs the built `dist` against the installed `jsonapi-ts`: run it after `yarn build`.

   `yarn build` fails when the public API no longer matches `etc/jsonapi-axios.api.md`. If the change is intended, run
   `yarn api:update` and commit the report: it shows the API change in the diff.

5. **Commit, then push `master` alone**, and wait for the CI to pass:

   ```sh
   git commit -am "Release 0.2.0"
   git push
   ```

6. **Tag and push the tag.** The tag must be `v` followed by the version of `package.json`:

   ```sh
   git tag -a v0.2.0 -m "v0.2.0"
   git push origin v0.2.0
   ```

7. **Follow the `Publish` workflow** in the Actions tab. It:
   - checks that the tag matches the version of `package.json`;
   - skips the publication if this version is already on npm;
   - runs lint, build, unit and integration tests again, then publishes.

8. **Check the result**:

   ```sh
   npm view @vgirol/jsonapi-axios version peerDependencies
   ```

   A new version can take a few minutes to appear. The npm page of the package shows the provenance under the
   version.

9. **Optionally, create a GitHub release** from the tag, with the changelog entry as notes.

## When something goes wrong

- **The tag does not match the version.** The `check` job fails, and nothing is published. Delete the tag, fix,
  then tag again:

  ```sh
  git tag -d v0.2.0
  git push origin :refs/tags/v0.2.0
  ```

- **The `publish` job fails before `npm publish`** (lint, build or tests). Nothing is published. Fix on `master`,
  then move the tag to the fixed commit, as above.

- **The `publish` job fails on `npm publish`.** Check the trusted publisher settings on npmjs.com, then re-run the
  workflow from the Actions tab.

- **A published version is broken.** A version number cannot be reused, even after `npm unpublish`. Publish a fixed
  version, then deprecate the broken one:

  ```sh
  npm deprecate @vgirol/jsonapi-axios@0.2.0 "Broken release, use 0.2.1"
  ```

## Publishing by hand

If the workflow cannot be used, a maintainer of the `vgirol` npm organization can publish from a clean clone of the
tagged commit. npm asks for two-factor authentication, and the version has no provenance:

```sh
yarn install --immutable && yarn build && yarn test run && yarn test:integration
npm publish --access public
```

Push the tag only once `npm view` shows the version: the workflow then skips the publication.
