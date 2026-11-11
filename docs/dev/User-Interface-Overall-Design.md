### Web Application
The UI is designed to be run as a web application. This was chosen for a number of reasons:

* End users will not need to install any software onto their local machine, making deployment and updates far easier
* Many frameworks exist to support the creation of web applications
* Web application development is a skill widely available in industry so onboarding new starters into the project should be easier

### Stack
The UI is a single-page application written in [TypeScript](https://www.typescriptlang.org/) with [React](https://react.dev/). React was chosen as it is a very easy to use framework for creating user interfaces, is very well documented and has a very large user base.

| Library | What it is used for |
|---------|---------------------|
| [React](https://react.dev/) | Components and state |
| [Vite](https://vite.dev/) | Development server and production build |
| [React Router](https://reactrouter.com/) | Moving between pages |
| [React Spectrum](https://react-spectrum.adobe.com/) | Buttons, tables, dialogs and other standard components |
| [Zod](https://zod.dev/) | Types for the data returned by the API, checked at runtime |
| [Plotly](https://plotly.com/javascript/) and [D3](https://d3js.org/) | Plotting and annotation in the [time series and profile 2D views](User-Interface-Time-Series-and-Profile-2D.md) |
| [Annotorious](https://annotorious.dev/) and [OpenSeadragon](https://openseadragon.github.io/) | Image annotation in the video view |

### Shared State
The UI makes heavy use of React's [contexts](https://react.dev/reference/react/createContext). These provide child components with access to shared data without passing it down through every component in between. The contexts are in [`src/app/contexts/`](https://github.com/ukaea/toktagger/tree/dev/toktagger/ui/src/app/contexts).
