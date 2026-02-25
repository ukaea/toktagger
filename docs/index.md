#

<figure markdown="span">
    ![TokTagger Logo](assets/logo_small.png){align=center}
  <figcaption>An open source, interactive annotation platform for Tokamak diagnostic data.</figcaption>
</figure>


TokTagger is a web-based platform for curating labeled datasets from tokamak diagnostics. It lets users browse shots, inspect signals and images, apply consistent labels, and manage annotations in one place. The Python API and React UI support local or team workflows, making it straightforward to create datasets for downstream analysis and machine-learning models.

It currently supports the following features:

- **Data Browsing**: Explore tokamak shots, signals, and images through an intuitive interface.
- **Annotation Tools**: Apply consistent labels to signals and images using a customizable tagging system.
- **Dataset Management**: Organize and manage annotations in a central repository.
- **Extensible API**: A Python API for integrating with existing workflows and tools.

## Quick Start

You can run the application locally through a simple pip install:

```sh
GIT_LFS_SKIP_SMUDGE=1 uv tool install --lfs --python 3.12.6 git+ssh://git@github.com/ukaea/toktagger.git`
```

Then run:

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
