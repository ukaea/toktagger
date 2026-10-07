# Change Log

## Unreleased
* Replaced the built-in password login with OpenID Connect. TokTagger no longer stores passwords. `auth.provider` is `canaille` (default, TokTagger runs a local Canaille identity provider) or `oidc` (Keycloak or any other provider). See `docs/user_management.md`.
* Global roles come from the identity provider group `auth.admin_group`. Users are created at their first sign-in.
* TokTagger does not connect identity provider accounts to users from the old password login. A user with the same name gets a new record.
* Added `auth.session_max_age_seconds`. A browser session ends after this time (default 12 hours), and the user signs in again. Access tokens from scripts do not change the global role.
* Removed `POST /auth/token`. Scripts send an identity provider access token and read it from `TOKTAGGER_API_TOKEN`.
* Added `server.forwarded_allow_ips`, `server.gunicorn_timeout` and `server.cors_origins`.
* Replaced `api.dockerfile` with a multi-stage `Dockerfile`. `docker-compose.yml` is now the production stack (Caddy, TokTagger, Keycloak, Postgres, MongoDB). The old development stack is in `docker-compose.dev.yml`. See `docs/deployment.md`.

## [v0.3.1](https://github.com/ukaea/toktagger/releases/tag/v0.3.1) - 2025-07-03
* Fixed bug related to loading float numpy arrays as images

## [v0.3.0](https://github.com/ukaea/toktagger/releases/tag/v0.3.0) - 2025-06-29
* Added support for using GPUs to train / predict ML models
* Added support for point annotations in video UI
* Added configuration file and extra config options
* Changed some environment variables to have new names - see documentation for more details

## [v0.2.1](https://github.com/ukaea/toktagger/releases/tag/v0.2.1) - 2025-06-22
* Added support for ML model predictions from video UI toolbar
* Fixed bug so that video annotations update immediately on importing
* Added support for loading local weights files for ML models
* Fixed bug to correctly update sample validation status when annotations are imported
* Fixed bug where annotation `created_by` field was being overwritten when validated
* Fixed zooming bug in time series UI
* Increased minimum supported Python version to 3.10

## [v0.2.0](https://github.com/ukaea/toktagger/releases/tag/v0.2.0) - 2025-06-08
* Added polygon tooling to image annotations UI
* Added propogate annotations toggle to image annotation UI
* Added zoom functionality to image annotation UI
* Fixed bug so that 'Clear' button marks sample as unvalidated
* Fixed bug where custom data loaders were not accessible inside ML model worker nodes
* Added custom ML model training and prediction parameters and dynamic UI for rendering
* Fixed bug so that ML model save/load uses file stem instead of full path
* Fixed bug where untrained ML models can be used for predictions
* Improved performance of Docker Compose
* Added 'hide annotations' toggle to image UI
* Redesigned image UI to align better with time series interface
* Refactored time series interface to improve performance
* Added a Numpy array file dataloader for images
* Added validated annotations column to samples table in UI
* Fixed bug where getOrInsert would cause UI not to load on older browsers
* Migrated documentation to Zensical

## [v0.1.1](https://github.com/ukaea/toktagger/releases/tag/v0.1.1) - 2025-03-30
* Fix bug with loading image annotations from database
* Refactor usage of state in image annotation UI

## [v0.1.0](https://github.com/ukaea/toktagger/releases/tag/v0.1.0) - 2025-03-10

* Initial release of TokTagger.
