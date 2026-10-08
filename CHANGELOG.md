# Changelog

All notable changes to this package are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the package uses
[semantic versioning](https://semver.org/). While the version is `0.x`, a breaking change bumps the minor version.

## [0.1.0] - 2026-10-08

First public release.

### Added

- `AxiosAdapter`, an adapter for `@vgirol/jsonapi-ts` built on an existing Axios instance, with named request and
  response interceptors.
- Axios errors are turned into the errors of `@vgirol/jsonapi-ts` (`JsonapiResponseError`, `JsonapiNetworkError`),
  with the `AxiosError` as `cause`.

[0.1.0]: https://github.com/VGirol/jsonapi-axios/releases/tag/v0.1.0
