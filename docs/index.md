# TokTagger

<figure markdown="span">
    ![TokTagger Logo](assets/logo_small.png){align=center}
  <figcaption>TokTagger: an open source, interactive annotation platform for Tokamak diagnostic data.</figcaption>
</figure>


TokTagger is a web-based platform for curating labeled datasets from tokamak diagnostics. It lets users browse shots, inspect signals and images, apply consistent labels, and manage annotations in one place. The Python API and React UI support local or team workflows, making it straightforward to create datasets for downstream analysis and machine-learning models.

It currently supports the following features:

- **Data Browsing**: Explore tokamak shots, signals, and images through an intuitive interface.
- **Annotation Tools**: Apply consistent labels to signals and images using a customizable tagging system.
- **ML Models**: Train and infer from ML models within the UI.
- **Dataset Management**: Organize and manage annotations in a central repository.
- **Extensible API**: A Python API for integrating with existing workflows and tools.


## Installation

To run the application locally:

### Install via pip
To install the package via `pip` (or similarly via `Poetry` or `uv` package managers):
```sh
python -m venv .venv
source .venv/bin/activate
GIT_LFS_SKIP_SMUDGE=1 pip install git+ssh://git@github.com/ukaea/toktagger.git
```
If you intend to add custom data loaders or models to your TokTagger instance, this is the recommended route.

### Install as a uv tool
Alternatively, it can be installed as a tool using `uv`:
```sh
GIT_LFS_SKIP_SMUDGE=1 uv tool install --lfs --python 3.12.6 git+ssh://git@github.com/ukaea/toktagger.git`
```

## Quick Start
To get started, run:

```sh
toktagger
```

This will start a local instance of the application running at `http://localhost:8002`.

## Project Links

 - [Git Repo](https://github.com/ukaea/toktagger)
 - [License](https://github.com/ukaea/toktagger/blob/main/LICENSE)
 - [Bug/Issue Tracker](https://github.com/ukaea/toktagger/issues)
 - [Contributing](https://github.com/ukaea/toktagger/blob/main/CONTRIBUTING.md)
 - [Cite](https://github.com/ukaea/toktagger/blob/main/CITATION.cff)
