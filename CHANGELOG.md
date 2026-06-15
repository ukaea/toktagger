# Change Log

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
